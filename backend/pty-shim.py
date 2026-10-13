#!/usr/bin/env python3
"""
TaskWeaver Native PTY Shim
通过操作系统 openpty 系统调用提供真实伪终端环境，支持动态调整尺寸 (SIGWINCH) 与进程树管理。
"""
import sys
import os
import pty
import select
import termios
import struct
import fcntl
import signal
import argparse
import json
import subprocess
import time

def set_winsize(fd, rows, cols):
    try:
        winsize = struct.pack("HHHH", int(rows), int(cols), 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except Exception:
        pass

def handle_termination(signum, _frame):
    raise SystemExit(128 + signum)

def process_groups_for_session(session_id):
    groups = {session_id}
    try:
        result = subprocess.run(
            ["/bin/ps", "-axo", "pid="],
            capture_output=True,
            text=True,
            timeout=1,
            check=False,
        )
        if result.returncode != 0:
            return groups
        for line in result.stdout.splitlines():
            try:
                candidate = int(line.strip())
                if os.getsid(candidate) == session_id:
                    groups.add(os.getpgid(candidate))
            except (ValueError, OSError):
                continue
    except (OSError, subprocess.SubprocessError):
        pass
    return groups

def signal_shell_session(session_id, signum):
    for group_id in process_groups_for_session(session_id):
        try:
            os.killpg(group_id, signum)
        except OSError:
            pass

def terminate_shell_session(pid):
    signal_shell_session(pid, signal.SIGTERM)
    # Allow the shell to exit cleanly, then kill every process group still in
    # its private session (interactive jobs may use separate process groups).
    time.sleep(0.1)
    signal_shell_session(pid, signal.SIGKILL)
    try:
        os.waitpid(pid, 0)
    except ChildProcessError:
        pass

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument("--rows", type=int, default=24)
    parser.add_argument("--cols", type=int, default=80)
    parser.add_argument("--shell", default="/bin/zsh")
    parser.add_argument("--shell-args-json", default="[]")
    args, unknown = parser.parse_known_args()
    try:
        shell_args = json.loads(args.shell_args_json)
        if not isinstance(shell_args, list) or not all(isinstance(value, str) for value in shell_args):
            raise ValueError("shell args must be a string array")
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        parser.error(f"invalid --shell-args-json: {exc}")

    # 打开真实伪终端
    master, slave = pty.openpty()
    set_winsize(master, args.rows, args.cols)

    # Handle SIGTERM in the wrapper before forking so an immediate close still
    # runs the finally block that terminates and reaps the shell process group.
    signal.signal(signal.SIGTERM, handle_termination)

    # Keep SIGTERM pending until the parent has recorded the fork result. This
    # closes the tiny window where the wrapper could exit before knowing which
    # shell process it must clean up.
    previous_signal_mask = signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGTERM})
    try:
        # 创建子进程并在新进程组中运行目标 Shell
        pid = os.fork()
    except BaseException:
        signal.pthread_sigmask(signal.SIG_SETMASK, previous_signal_mask)
        raise

    if pid == 0:
        # 子进程：连接到 slave 伪终端
        signal.pthread_sigmask(signal.SIG_SETMASK, previous_signal_mask)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)
        os.close(master)
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)

        try:
            os.chdir(args.cwd)
        except Exception as e:
            sys.stderr.write(f"Failed to enter terminal working directory: {e}\n")
            sys.exit(1)

        # 设置终端环境变量
        os.environ["TERM"] = "xterm-256color"
        os.environ["COLORTERM"] = "truecolor"

        shell = args.shell if os.path.exists(args.shell) else "/bin/sh"
        try:
            os.execv(shell, [shell, *shell_args])
        except Exception as e:
            sys.stderr.write(f"Failed to exec {shell}: {e}\n")
            sys.exit(1)

    try:
        # Unblocking can deliver a pending SIGTERM; the finally block below
        # already knows the child PID and will clean up its private session.
        signal.pthread_sigmask(signal.SIG_SETMASK, previous_signal_mask)

        # 父进程：中继 master 伪终端与父级 Node.js 进程的 stdin/stdout
        os.close(slave)

        # 忽略 SIGINT，让子进程处理 Ctrl-C
        signal.signal(signal.SIGINT, signal.SIG_IGN)

        stdin_fileno = sys.stdin.fileno()
        stdout_fileno = sys.stdout.fileno()

        # 设置 stdin 为非阻塞
        orig_fl = fcntl.fcntl(stdin_fileno, fcntl.F_GETFL)
        fcntl.fcntl(stdin_fileno, fcntl.F_SETFL, orig_fl | os.O_NONBLOCK)

        # 缓存控制指令解析
        # 尺寸控制协议：__TW_RESIZE__:<rows>:<cols>\n
        buffer = b""

        while True:
            rlist, _, _ = select.select([master, stdin_fileno], [], [])

            if master in rlist:
                try:
                    data = os.read(master, 4096)
                    if not data:
                        break
                    os.write(stdout_fileno, data)
                except OSError:
                    break

            if stdin_fileno in rlist:
                try:
                    input_data = os.read(stdin_fileno, 4096)
                    if not input_data:
                        break

                    # 检查是否包含自定义尺寸调整控制指令
                    if b"__TW_RESIZE__:" in input_data:
                        parts = input_data.split(b"\n")
                        normal_data = b""
                        for part in parts:
                            if part.startswith(b"__TW_RESIZE__:"):
                                try:
                                    _, r_str, c_str = part.decode("ascii").split(":")
                                    set_winsize(master, int(r_str), int(c_str))
                                except Exception:
                                    pass
                            else:
                                if normal_data:
                                    normal_data += b"\n" + part
                                else:
                                    normal_data = part
                        if normal_data:
                            os.write(master, normal_data)
                    else:
                        os.write(master, input_data)
                except BlockingIOError:
                    pass
                except OSError:
                    break

    finally:
        try:
            os.close(master)
        except OSError:
            pass
        terminate_shell_session(pid)

if __name__ == "__main__":
    main()
