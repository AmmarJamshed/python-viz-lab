@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m PyInstaller --noconfirm python_viz_lab.spec

echo.
echo Built: dist\PythonVizLab\PythonVizLab.exe
echo Distribute the entire dist\PythonVizLab folder.
endlocal
