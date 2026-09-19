# Python Viz Lab

Teach Python by letting beginners **edit real Python** and instantly see how a website, status badge, table, chart, or console changes.

You choose **any lesson topic** and **any visualization mode**. Their `print()` calls, variables, or `viz.*` helpers drive the live preview.

## Features

- Desktop app (local EXE or `python main.py`)
- Code editor with live re-run as you type
- Visualization modes you can switch anytime:
  - Website / checkout
  - Big status
  - Variable cards
  - Table / list
  - Bar chart
  - Console only
  - Auto (best guess)
- Built-in examples under `examples/`
- Save your own lessons into `examples/` (API: `save_lesson`)

## How learners drive the UI

```python
print("Order successful")          # updates status / website

viz.status("success", "Paid!")     # explicit status
viz.set("title", "My Shop")
viz.items(["A", "B"])
viz.chart(["Mon", "Tue"], [3, 7])

total = 42                         # shows up in Variable cards
```

Switch **Visualize as** in the toolbar to see the same run as a different UI.

## Run from source

```bash
cd python-viz-lab
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
python main.py
```

## Build a local EXE (Windows)

```bash
.venv\Scripts\activate
pip install -r requirements.txt
python -m PyInstaller --noconfirm python_viz_lab.spec
```

The app appears at `dist\PythonVizLab\PythonVizLab.exe`.  
Ship the whole `PythonVizLab` folder (it includes `web/` and `examples/`).

Or use:

```bash
build_exe.bat
```

## Create your own visualization lesson

1. Add `examples/my_lesson.py` with starter code.
2. Add `examples/my_lesson.json`:

```json
{
  "id": "my_lesson",
  "title": "My lesson title",
  "viz": "website",
  "hint": "Tell the student what to change"
}
```

3. Restart the app — it shows up in the **Example** dropdown.

You can use any Python that makes sense for your topic (shop, game HUD, quiz score, weather, etc.). Pick the viz mode that best shows the effect.

## Project layout

```
main.py          # desktop window (pywebview)
runner.py        # executes learner code + viz bridge
web/             # UI (editor + preview)
examples/        # starter lessons
python_viz_lab.spec
build_exe.bat
```

## Note on safety

Learner code runs on the local machine (same as a normal Python file). Use this for teaching trusted students / classrooms. Do not expose it as a public multi-tenant sandbox without further isolation.
