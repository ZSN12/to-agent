"""Pure-Python checks for the code runtime's execution loop and resource policy."""

from __future__ import annotations

import asyncio
import pathlib
import sys
import unittest

PY_DIR = pathlib.Path(__file__).resolve().parents[1] / "py"
sys.path.insert(0, str(PY_DIR))

from runner import (  # noqa: E402
    ProtocolError,
    PythonRunner,
    _check_json_value,
    apply_resource_limits,
    validate_boot,
    validate_run,
)
from protocol import log_truncation_marker  # noqa: E402


def make_boot(namespaces=None, max_log=65536, max_value=65536):
    return {
        "type": "boot",
        "cpuSeconds": 30,
        "addressSpaceBytes": 512 * 1024 * 1024,
        "maxLogBytes": max_log,
        "maxValueBytes": max_value,
        "namespaces": namespaces or [],
    }


class FakeChannel:
    def __init__(self):
        self.frames = []
        self.on_send = None

    def send(self, frame):
        self.frames.append(frame)
        if self.on_send is not None:
            self.on_send(frame)


class FakeResource:
    RLIMIT_CPU = 1
    RLIMIT_AS = 2
    RLIM_INFINITY = -1

    def __init__(self):
        self.limits = {self.RLIMIT_CPU: (-1, -1), self.RLIMIT_AS: (-1, -1)}
        self.calls = []

    def getrlimit(self, resource):
        return self.limits[resource]

    def setrlimit(self, resource, limits):
        self.calls.append((resource, limits))
        self.limits[resource] = limits


class PythonRunnerTests(unittest.TestCase):
    def run_program(self, program, namespaces=None, max_log=65536, max_value=65536, on_send=None):
        channel = FakeChannel()
        runner = PythonRunner(channel, make_boot(namespaces, max_log, max_value))
        channel.on_send = on_send or runner.receive_reply
        result = asyncio.run(runner.execute(program))
        return result, channel.frames

    def test_runs_async_function_body_and_captures_stdout_stderr_in_order(self):
        result, frames = self.run_program(
            "import asyncio, sys\n"
            "print('out', end='')\n"
            "sys.stderr.write('err')\n"
            "return await asyncio.sleep(0, result={'ok': True})"
        )
        self.assertEqual(result, {"type": "done", "value": {"ok": True}})
        self.assertEqual([frame["text"] for frame in frames], ["out", "err"])

    def test_bridges_binding_calls_and_resolves_host_reply(self):
        def reply(frame):
            if frame["type"] == "call":
                self.assertEqual(frame["global"], "tools")
                self.assertEqual(frame["name"], "echo")
                frame_runner.receive_reply({"type": "reply", "id": frame["id"], "ok": True, "value": frame["args"]})

        channel = FakeChannel()
        frame_runner = PythonRunner(channel, make_boot([{"global": "tools", "names": ["echo"]}]))
        channel.on_send = reply
        result = asyncio.run(frame_runner.execute("return await tools.echo({'value': 3})"))
        self.assertEqual(result["value"], {"value": 3})
        self.assertEqual([frame["type"] for frame in channel.frames], ["call"])

    def test_binding_rejection_uses_declared_error_class_and_member_property(self):
        def reply(frame):
            if frame["type"] == "call":
                frame_runner.receive_reply({"type": "reply", "id": frame["id"], "ok": False, "message": "denied"})

        channel = FakeChannel()
        frame_runner = PythonRunner(channel, make_boot([{
            "global": "tools",
            "names": ["fail"],
            "errorClass": {"name": "ToolBindingError", "memberNameProperty": "member"},
        }]))
        channel.on_send = reply
        result = asyncio.run(frame_runner.execute(
            "try:\n"
            "    await tools.fail(None)\n"
            "except ToolBindingError as error:\n"
            "    return [str(error), error.member]"
        ))
        self.assertEqual(result["value"], ["denied", "fail"])

    def test_output_cap_emits_one_marker_then_reports_output_limit(self):
        result, frames = self.run_program("print('abcdefgh', end='')", max_log=5)
        self.assertEqual(result["error"]["kind"], "output-limit")
        self.assertEqual(frames, [
            {"type": "log", "text": "abcde"},
            {"type": "log", "text": log_truncation_marker(5), "truncated": True},
        ])

    def test_completion_value_cap_and_non_json_value_are_explicit_failures(self):
        over_limit, _ = self.run_program("return {'x': 1}", max_value=4)
        self.assertEqual(over_limit["error"]["kind"], "output-limit")
        invalid, _ = self.run_program("return {1, 2}")
        self.assertEqual(invalid["error"]["kind"], "invalid-output")

    def test_reserved_globals_cannot_replace_runner_slots(self):
        result, _ = self.run_program(
            "return None",
            namespaces=[{"global": "__dsh_main__", "names": []}],
        )
        self.assertEqual(result["error"]["kind"], "exception")

    def test_boot_and_run_frames_require_complete_positive_caps(self):
        boot = validate_boot(make_boot())
        self.assertEqual(boot["type"], "boot")
        with self.assertRaises(ProtocolError):
            validate_boot(dict(make_boot(), maxLogBytes=0))
        self.assertEqual(validate_run({"type": "run", "program": "return 1"}), "return 1")
        with self.assertRaises(ProtocolError):
            validate_run({"type": "run", "program": 7})

    def test_python_values_must_be_lossless_json(self):
        for value in (float("nan"), float("inf"), -0.0, 9007199254740993, {1: "bad"}, {"x"}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                _check_json_value(value)
        cycle = []
        cycle.append(cycle)
        with self.assertRaises(ValueError):
            _check_json_value(cycle)
        shared = [1]
        _check_json_value([shared, shared])

    def test_resource_limits_skip_address_space_on_macos(self):
        resource = FakeResource()
        applied = apply_resource_limits(make_boot(), platform="darwin", resource_module=resource)
        self.assertEqual(applied, ["RLIMIT_CPU"])
        self.assertEqual([resource for resource, _ in resource.calls], [FakeResource.RLIMIT_CPU])

    def test_resource_limits_apply_cpu_and_address_space_on_linux(self):
        resource = FakeResource()
        applied = apply_resource_limits(make_boot(), platform="linux", resource_module=resource)
        self.assertEqual(applied, ["RLIMIT_CPU", "RLIMIT_AS"])
        self.assertEqual(resource.calls[0], (FakeResource.RLIMIT_CPU, (30, 31)))
        self.assertEqual(resource.calls[1], (FakeResource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024)))


if __name__ == "__main__":
    unittest.main()
