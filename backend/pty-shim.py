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

def set_winsize(fd, rows, cols):
    try:
        winsize = struct.pack("HHHH", int(rows), int(cols), 0, 0)
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except Exception:
        pass

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cwd", default=os.getcwd())
    parser.add_argument("--rows", type=int, default=24)
    parser.add_argument("--cols", type=int, default=80)
    parser.add_argument("--shell", default="/bin/zsh")
    args, unknown = parser.parse_known_args()

    # 打开真实伪终端
    master, slave = pty.openpty()
    set_winsize(master, args.rows, args.cols)

    # 创建子进程并在新进程组中运行目标 Shell
    pid = os.fork()
    if pid == 0:
        # 子进程：连接到 slave 伪终端
        os.close(master)
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)

        try:
            if os.path.isdir(args.cwd):
                os.chdir(args.cwd)
        except Exception:
            pass

        # 设置终端环境变量
        os.environ["TERM"] = "xterm-256color"
        os.environ["COLORTERM"] = "truecolor"

        shell = args.shell if os.path.exists(args.shell) else "/bin/sh"
        try:
            os.execv(shell, [shell, "-l"])
        except Exception as e:
            sys.stderr.write(f"Failed to exec {shell}: {e}\n")
            sys.exit(1)

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

    try:
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
        os.close(master)
        try:
            os.killpg(pid, signal.SIGTERM)
        except Exception:
            pass
        try:
            os.waitpid(pid, 0)
        except Exception:
            pass

if __name__ == "__main__":
    main()
