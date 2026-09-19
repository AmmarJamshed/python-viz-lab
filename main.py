"""Python Viz Lab — edit Python, pick a visualization, see it live."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import webview

from runner import run_python


def app_root() -> Path:
    """Project root in dev; folder next to the EXE when frozen."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def resource_root() -> Path:
    """Bundled resources (PyInstaller _MEIPASS) or project root."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent


ROOT = app_root()
BUNDLE = resource_root()
# Prefer editable web/ next to the EXE so UI tweaks apply without a full rebuild.
WEB = ROOT / "web" if (ROOT / "web" / "index.html").exists() else BUNDLE / "web"
EXAMPLES = (
    ROOT / "examples"
    if (ROOT / "examples").exists()
    else BUNDLE / "examples"
)


class Api:
    def run(self, code: str) -> dict:
        return run_python(code or "")

    def list_examples(self) -> list[dict]:
        items: list[dict] = []
        if not EXAMPLES.exists():
            return items
        for path in sorted(EXAMPLES.glob("*.py")):
            meta_path = path.with_suffix(".json")
            meta = {
                "id": path.stem,
                "title": path.stem.replace("_", " ").title(),
                "viz": "website",
                "hint": "",
            }
            if meta_path.exists():
                try:
                    meta.update(json.loads(meta_path.read_text(encoding="utf-8")))
                except json.JSONDecodeError:
                    pass
            meta["code"] = path.read_text(encoding="utf-8")
            items.append(meta)
        return items

    def save_lesson(self, name: str, code: str, viz: str, hint: str = "") -> dict:
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name.strip()) or "lesson"
        EXAMPLES.mkdir(parents=True, exist_ok=True)
        py_path = EXAMPLES / f"{safe}.py"
        json_path = EXAMPLES / f"{safe}.json"
        py_path.write_text(code, encoding="utf-8")
        json_path.write_text(
            json.dumps(
                {
                    "id": safe,
                    "title": name.strip() or safe,
                    "viz": viz,
                    "hint": hint,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        return {"ok": True, "id": safe}


def main() -> int:
    index = WEB / "index.html"
    if not index.exists():
        print(f"Missing UI: {index}", file=sys.stderr)
        return 1

    api = Api()
    icon = WEB / "assets" / "icon.png"
    window_kwargs: dict = {
        "title": "Python Viz Lab",
        "url": index.as_uri(),
        "js_api": api,
        "width": 1280,
        "height": 840,
        "min_size": (900, 600),
    }
    if icon.exists():
        window_kwargs["icon"] = str(icon)

    try:
        webview.create_window(**window_kwargs)
    except TypeError:
        window_kwargs.pop("icon", None)
        webview.create_window(**window_kwargs)
    webview.start(debug=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
