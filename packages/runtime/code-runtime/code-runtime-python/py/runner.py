"""Host-driven Python code runner for ``dsh-code-runtime-python``.

The host starts one process per run and speaks the JSON-lines protocol on fd 3.
stdout and stderr are reserved for the model program's captured logs. Wall-time
and AbortSignal enforcement belong to the host: it terminates this process and
maps that event to the code-runtime result taxonomy. This runner adds CPU and,
on supported Linux hosts, address-space limits before executing model code.
"""

from __future__ import annotations

import asyncio
import builtins
import io
import json
import math
import os
import sys
import textwrap
import threading
import traceback
from typing import Any, Callable, Dict, List, Optional

# Python launched with `-I` omits the script directory from sys.path. The
# bundled protocol mirror is intentionally imported only from this package.
_PY_DIR = os.path.dirname(os.path.abspath(__file__))
if _PY_DIR not in sys.path:
    sys.path.insert(0, _PY_DIR)

from protocol import PROTOCOL_FD, log_truncation_marker

RESERVED_GLOBALS = {"console", "__dsh_main__", "__builtins__", "__name__", "__debug__"}


class ProtocolError(ValueError):
    """The trusted host sent an invalid boot/run/reply frame."""


class OutputLimitReached(Exception):
    """The program exhausted its stdout/stderr capture allowance."""


class BindingCallError(Exception):
    """A host binding rejected one call and no typed class was declared."""


def _json_constant(name: str) -> Any:
    raise ValueError("non-finite JSON number: " + name)


def _loads_frame(line: bytes) -> Any:
    return json.loads(line.decode("utf-8"), parse_constant=_json_constant)


def _dumps_frame(frame: Any) -> bytes:
    # ensure_ascii keeps even lone Unicode surrogates on a valid ASCII wire.
    return (json.dumps(frame, ensure_ascii=True, allow_nan=False, separators=(",", ":")) + "\n").encode("ascii")


def _check_json_value(value: Any, active: Optional[set] = None) -> None:
    """Reject values whose JSON representation would not survive a JS roundtrip."""
    if value is None or isinstance(value, (str, bool)):
        return
    if isinstance(value, int):
        # JSON.parse uses IEEE-754 numbers. Admit larger integers only when that
        # exact integer is still representable as a JavaScript Number.
        try:
            number = float(value)
        except (OverflowError, ValueError):
            raise ValueError("integer is not a finite JavaScript number")
        if not math.isfinite(number) or int(number) != value:
            raise ValueError("integer is not lossless in JavaScript")
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("number must be finite")
        if value == 0 and math.copysign(1.0, value) < 0:
            raise ValueError("negative zero is not lossless JSON")
        return
    if not isinstance(value, (list, dict)):
        raise ValueError("value must contain only JSON values")

    if active is None:
        active = set()
    identity = id(value)
    if identity in active:
        raise ValueError("cyclic values are not JSON")
    active.add(identity)
    try:
        if isinstance(value, list):
            for member in value:
                _check_json_value(member, active)
        else:
            for key, member in value.items():
                if not isinstance(key, str):
                    raise ValueError("object keys must be strings")
                _check_json_value(member, active)
    finally:
        active.remove(identity)


def _json_size(value: Any) -> int:
    _check_json_value(value)
    return len(json.dumps(value, ensure_ascii=True, allow_nan=False, separators=(",", ":")).encode("ascii"))


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _positive_int(value: Any, label: str) -> int:
    if not _is_int(value) or value <= 0:
        raise ProtocolError(label + " must be a positive integer")
    return value


def validate_boot(frame: Any) -> Dict[str, Any]:
    if not isinstance(frame, dict) or frame.get("type") != "boot":
        raise ProtocolError("expected boot frame")
    boot = {
        "type": "boot",
        "cpuSeconds": _positive_int(frame.get("cpuSeconds"), "cpuSeconds"),
        "addressSpaceBytes": _positive_int(frame.get("addressSpaceBytes"), "addressSpaceBytes"),
        "maxLogBytes": _positive_int(frame.get("maxLogBytes"), "maxLogBytes"),
        "maxValueBytes": _positive_int(frame.get("maxValueBytes"), "maxValueBytes"),
        "namespaces": frame.get("namespaces"),
    }
    if not isinstance(boot["namespaces"], list):
        raise ProtocolError("namespaces must be an array")
    for namespace in boot["namespaces"]:
        if not isinstance(namespace, dict) or not isinstance(namespace.get("global"), str) or not isinstance(namespace.get("names"), list):
            raise ProtocolError("invalid namespace declaration")
        if not all(isinstance(name, str) for name in namespace["names"]):
            raise ProtocolError("namespace names must be strings")
        error_class = namespace.get("errorClass")
        if error_class is not None and (
            not isinstance(error_class, dict)
            or not isinstance(error_class.get("name"), str)
            or not isinstance(error_class.get("memberNameProperty"), str)
        ):
            raise ProtocolError("invalid namespace errorClass")
    return boot


def validate_run(frame: Any) -> str:
    if not isinstance(frame, dict) or frame.get("type") != "run" or not isinstance(frame.get("program"), str):
        raise ProtocolError("expected run frame with a string program")
    return frame["program"]


def apply_resource_limits(
    boot: Dict[str, Any],
    platform: Optional[str] = None,
    resource_module: Any = None,
) -> List[str]:
    """Apply CPU limits everywhere supported and RLIMIT_AS on Linux only.

    macOS does not provide a usable RLIMIT_AS for this subprocess contract; its
    host-enforced wall timeout and output limit remain the fallback. Windows
    similarly relies on the host to kill the process at the wall deadline.
    """
    target_platform = platform or sys.platform
    if resource_module is None:
        try:
            import resource as resource_module  # type: ignore[no-redef]
        except ImportError:
            return []

    applied: List[str] = []
    cpu_limit = boot["cpuSeconds"]
    if hasattr(resource_module, "RLIMIT_CPU"):
        old_soft, old_hard = resource_module.getrlimit(resource_module.RLIMIT_CPU)
        hard_limit = cpu_limit + 1
        if old_hard != resource_module.RLIM_INFINITY:
            hard_limit = min(hard_limit, old_hard)
        soft_limit = min(cpu_limit, hard_limit)
        resource_module.setrlimit(resource_module.RLIMIT_CPU, (soft_limit, hard_limit))
        applied.append("RLIMIT_CPU")

    if target_platform.startswith("linux") and hasattr(resource_module, "RLIMIT_AS"):
        memory_limit = boot["addressSpaceBytes"]
        _, old_hard = resource_module.getrlimit(resource_module.RLIMIT_AS)
        hard_limit = memory_limit if old_hard == resource_module.RLIM_INFINITY else min(memory_limit, old_hard)
        resource_module.setrlimit(resource_module.RLIMIT_AS, (hard_limit, hard_limit))
        applied.append("RLIMIT_AS")
    return applied


class FdProtocol:
    """Small, line-framed, duplex fd-3 transport; the read side is blocking."""

    def __init__(self, fd: int = PROTOCOL_FD) -> None:
        self._reader = os.fdopen(os.dup(fd), "rb", buffering=0)
        self._writer = os.fdopen(os.dup(fd), "wb", buffering=0)
        self._write_lock = threading.Lock()

    def receive(self) -> Optional[Any]:
        line = self._reader.readline()
        if not line:
            return None
        return _loads_frame(line)

    def send(self, frame: Any) -> None:
        data = _dumps_frame(frame)
        with self._write_lock:
            self._writer.write(data)
            self._writer.flush()

    def start_reply_reader(self, loop: asyncio.AbstractEventLoop, runner: "PythonRunner") -> None:
        def read_replies() -> None:
            while True:
                try:
                    frame = self.receive()
                except Exception as error:
                    loop.call_soon_threadsafe(runner.protocol_failed, error)
                    return
                if frame is None:
                    loop.call_soon_threadsafe(runner.protocol_failed, EOFError("host closed protocol fd"))
                    return
                loop.call_soon_threadsafe(runner.receive_reply, frame)

        threading.Thread(target=read_replies, name="python-code-runtime-protocol", daemon=True).start()


class BindingNamespace(dict):
    """Attribute access over an own-key mapping, including names like `items`."""

    __slots__ = ()

    def __getattribute__(self, name: str) -> Any:
        if dict.__contains__(self, name):
            return dict.__getitem__(self, name)
        return dict.__getattribute__(self, name)


class LogCapture:
    def __init__(self, channel: Any, max_bytes: int) -> None:
        self.channel = channel
        self.max_bytes = max_bytes
        self.bytes = 0
        self.truncated = False

    def write(self, text: str) -> int:
        if not isinstance(text, str):
            raise TypeError("stdout/stderr write() expects str")
        if self.truncated or not text:
            return len(text)

        prefix_chars: List[str] = []
        prefix_bytes = 0
        for char in text:
            size = len(char.encode("utf-8", errors="surrogatepass"))
            if self.bytes + prefix_bytes + size > self.max_bytes:
                break
            prefix_chars.append(char)
            prefix_bytes += size
        prefix = "".join(prefix_chars)
        if prefix:
            self.channel.send({"type": "log", "text": prefix})
            self.bytes += prefix_bytes
        if len(prefix) < len(text):
            self.truncated = True
            self.channel.send({"type": "log", "text": log_truncation_marker(self.max_bytes), "truncated": True})
            raise OutputLimitReached("stdout/stderr capture exceeded %d bytes" % self.max_bytes)
        return len(text)


class CapturedTextStream(io.TextIOBase):
    def __init__(self, logs: LogCapture) -> None:
        super().__init__()
        self._logs = logs
        self._buffer = _CapturedBinaryStream(logs)

    @property
    def encoding(self) -> str:
        return "utf-8"

    @property
    def errors(self) -> str:
        return "replace"

    @property
    def buffer(self) -> "_CapturedBinaryStream":
        return self._buffer

    def writable(self) -> bool:
        return True

    def isatty(self) -> bool:
        return False

    def write(self, text: str) -> int:
        return self._logs.write(text)

    def flush(self) -> None:
        return None


class _CapturedBinaryStream:
    def __init__(self, logs: LogCapture) -> None:
        self._logs = logs

    def write(self, data: bytes) -> int:
        text = bytes(data).decode("utf-8", errors="replace")
        self._logs.write(text)
        return len(data)

    def flush(self) -> None:
        return None


class PythonRunner:
    """Executes one program body and bridges async namespace calls over the protocol."""

    def __init__(self, channel: Any, boot: Dict[str, Any]) -> None:
        self.channel = channel
        self.boot = boot
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.pending: Dict[int, asyncio.Future] = {}
        self.next_call_id = 0
        self.logs = LogCapture(channel, boot["maxLogBytes"])
        self.stdout = CapturedTextStream(self.logs)
        self.output_limited = False

    async def execute(self, program: str) -> Dict[str, Any]:
        self.loop = asyncio.get_running_loop()
        namespaces: Dict[str, Any] = {}
        globals_dict: Dict[str, Any] = {
            "__builtins__": builtins.__dict__,
            "__name__": "__dsh__",
        }
        for namespace in self.boot["namespaces"]:
            global_name = namespace["global"]
            if global_name in RESERVED_GLOBALS or global_name in globals_dict or global_name in namespaces:
                return self._failure("exception", "duplicate injected global %r" % global_name)
            binding_object = BindingNamespace()
            descriptor = namespace.get("errorClass")
            error_type = self._make_binding_error_class(descriptor) if descriptor else None
            for name in namespace["names"]:
                binding_object[name] = self._make_binding(global_name, name, error_type)
            globals_dict[global_name] = binding_object
            namespaces[global_name] = binding_object
            if descriptor:
                error_name = descriptor["name"]
                if error_name in RESERVED_GLOBALS or error_name in globals_dict or error_name in namespaces:
                    return self._failure("exception", "duplicate injected global %r" % error_name)
                globals_dict[error_name] = error_type
                namespaces[error_name] = globals_dict[error_name]

        source = textwrap.indent(program if program.strip() else "pass", "    ")
        wrapped = "async def __dsh_main__():\n" + source + "\n"
        original_stdout, original_stderr = sys.stdout, sys.stderr
        sys.stdout = self.stdout
        sys.stderr = self.stdout
        try:
            exec(compile(wrapped, "<dsh-code-runtime-python>", "exec"), globals_dict, globals_dict)
            value = await globals_dict["__dsh_main__"]()
        except OutputLimitReached:
            self.output_limited = True
            value = None
        except BaseException as error:
            if self.logs.truncated:
                self.output_limited = True
                value = None
            else:
                return self._failure("exception", self._traceback(error))
        finally:
            sys.stdout, sys.stderr = original_stdout, original_stderr

        if self.output_limited or self.logs.truncated:
            return self._failure("output-limit", "stdout/stderr capture exceeded %d bytes" % self.boot["maxLogBytes"])
        try:
            value_bytes = _json_size(value)
        except (TypeError, ValueError, OverflowError, RecursionError) as error:
            return self._failure("invalid-output", str(error) or "completion value must be lossless JSON")
        if value_bytes > self.boot["maxValueBytes"]:
            return self._failure("output-limit", "completion value exceeded %d bytes" % self.boot["maxValueBytes"])
        return {"type": "done", "value": value}

    def receive_reply(self, frame: Any) -> None:
        if not isinstance(frame, dict) or frame.get("type") != "reply":
            return
        call_id = frame.get("id")
        if not _is_int(call_id):
            return
        future = self.pending.pop(call_id, None)
        if future is None or future.done():
            return
        if frame.get("ok") is True and "value" in frame:
            try:
                _check_json_value(frame["value"])
            except (TypeError, ValueError, RecursionError) as error:
                future.set_exception(BindingCallError("binding resolution must be lossless JSON: " + str(error)))
            else:
                future.set_result(frame["value"])
        elif frame.get("ok") is False and isinstance(frame.get("message"), str):
            future.set_exception(BindingCallError(frame["message"]))
        else:
            future.set_exception(BindingCallError("host returned an invalid binding reply"))

    def protocol_failed(self, error: BaseException) -> None:
        for call_id, future in list(self.pending.items()):
            self.pending.pop(call_id, None)
            if not future.done():
                future.set_exception(BindingCallError("host protocol closed: " + str(error)))

    def _make_binding(self, global_name: str, name: str, error_type: Optional[type] = None) -> Callable[[Any], Any]:
        def binding_error(message: str) -> BaseException:
            return error_type(name, message) if error_type is not None else BindingCallError(message)

        async def call(args: Any) -> Any:
            if self.loop is None:
                raise binding_error("binding runtime is not active")
            try:
                _check_json_value(args)
                # Validate serialization before publishing a frame. This also
                # rejects unsupported Python types before they reach the host.
                json.dumps(args, ensure_ascii=True, allow_nan=False, separators=(",", ":"))
            except (TypeError, ValueError, OverflowError, RecursionError) as error:
                raise binding_error("binding arguments must be lossless JSON: " + str(error))
            self.next_call_id += 1
            call_id = self.next_call_id
            future = self.loop.create_future()
            self.pending[call_id] = future
            try:
                self.channel.send({
                    "type": "call",
                    "id": call_id,
                    "global": global_name,
                    "name": name,
                    "args": args,
                })
            except BaseException:
                self.pending.pop(call_id, None)
                raise
            try:
                return await future
            except BindingCallError as error:
                raise binding_error(str(error))
            finally:
                self.pending.pop(call_id, None)

        return call

    @staticmethod
    def _make_binding_error_class(descriptor: Dict[str, str]) -> type:
        class_name = descriptor["name"]
        member_property = descriptor["memberNameProperty"]

        def initialize(error: Exception, member_name: str, message: str) -> None:
            Exception.__init__(error, message)
            setattr(error, member_property, member_name)

        return type(class_name, (Exception,), {"__init__": initialize, "__module__": "__dsh__"})

    @staticmethod
    def _traceback(error: BaseException) -> str:
        try:
            return "".join(traceback.format_exception(type(error), error, error.__traceback__))
        except BaseException:
            return str(error) or type(error).__name__

    def _failure(self, kind: str, message: str) -> Dict[str, Any]:
        if len(json.dumps(message, ensure_ascii=True).encode("ascii")) > self.boot["maxValueBytes"]:
            return {"type": "done", "error": {"kind": "output-limit", "message": "failure diagnostic exceeded %d bytes" % self.boot["maxValueBytes"]}}
        return {"type": "done", "error": {"kind": kind, "message": message}}


async def _run_program(channel: FdProtocol, boot: Dict[str, Any], program: str) -> Dict[str, Any]:
    runner = PythonRunner(channel, boot)
    loop = asyncio.get_running_loop()
    channel.start_reply_reader(loop, runner)
    return await runner.execute(program)


def main() -> int:
    channel = FdProtocol()
    try:
        boot = validate_boot(channel.receive())
        apply_resource_limits(boot)
        channel.send({"type": "boot-ack"})
        program = validate_run(channel.receive())
        result = asyncio.run(_run_program(channel, boot, program))
        channel.send(result)
        return 0
    except (ProtocolError, OSError, ValueError) as error:
        try:
            channel.send({"type": "done", "error": {"kind": "exception", "message": str(error)}})
        except BaseException:
            pass
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
