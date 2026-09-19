"""Execute learner Python and collect outputs for visualization."""

from __future__ import annotations

import io
import traceback
from contextlib import redirect_stderr, redirect_stdout
from typing import Any


SKIP_NAMES = {
    "__builtins__",
    "__name__",
    "__doc__",
    "__package__",
    "__loader__",
    "__spec__",
    "viz",
}


class VizBridge:
    """Helpers learners can call from their code to drive the UI."""

    def __init__(self) -> None:
        self.data: dict[str, Any] = {}
        self.events: list[dict[str, Any]] = []

    def set(self, key: str | None = None, value: Any = None, **kwargs: Any) -> None:
        if kwargs:
            self.data.update(kwargs)
        if key is not None and value is not None:
            self.data[key] = value
        self.events.append({"type": "set", "data": dict(self.data)})

    def show(self, **kwargs: Any) -> None:
        self.data.update(kwargs)
        self.events.append({"type": "show", "data": dict(kwargs)})

    def status(self, value: str, message: str | None = None) -> None:
        self.data["status"] = value
        if message is not None:
            self.data["message"] = message
        self.events.append({"type": "status", "data": dict(self.data)})

    def title(self, value: str) -> None:
        self.data["title"] = value

    def items(self, value: list[Any]) -> None:
        self.data["items"] = list(value)

    def chart(self, labels: list[Any], values: list[Any]) -> None:
        self.data["labels"] = list(labels)
        self.data["values"] = list(values)

    def clear(self) -> None:
        self.data.clear()
        self.events.clear()


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    return repr(value)


def _collect_vars(namespace: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name, value in namespace.items():
        if name in SKIP_NAMES or name.startswith("_"):
            continue
        if callable(value) and not isinstance(value, type):
            continue
        try:
            out[name] = _json_safe(value)
        except Exception:
            out[name] = "<unreadable>"
    return out


def run_python(code: str) -> dict[str, Any]:
    """Run user code and return stdout, stderr, viz payload, and variables."""
    viz = VizBridge()
    stdout_buf = io.StringIO()
    stderr_buf = io.StringIO()
    namespace: dict[str, Any] = {
        "__name__": "__main__",
        "viz": viz,
    }

    error: str | None = None
    try:
        with redirect_stdout(stdout_buf), redirect_stderr(stderr_buf):
            exec(compile(code, "<lesson>", "exec"), namespace, namespace)
    except Exception:
        error = traceback.format_exc()

    stdout = stdout_buf.getvalue()
    stderr = stderr_buf.getvalue()
    if error:
        stderr = (stderr + "\n" + error).strip()

    # If learner never used viz.*, treat last print line as status/message.
    if not viz.data and stdout.strip():
        last_line = stdout.strip().splitlines()[-1]
        viz.data["message"] = last_line
        viz.data["status"] = last_line.lower()
        viz.data["from_print"] = True

    return {
        "ok": error is None,
        "stdout": stdout,
        "stderr": stderr,
        "viz": _json_safe(viz.data),
        "events": _json_safe(viz.events),
        "vars": _collect_vars(namespace),
    }
