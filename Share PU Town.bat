@echo off
rem Double-click to play PU Town with friends anywhere: it prints a public link to send them.
rem Close this window, or press Ctrl+C in it, to stop the game and the link.
cd /d "%~dp0"
python run.py --share
pause
