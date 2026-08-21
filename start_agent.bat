@echo off
title AI Job Recommendation Agent (55m Runner)
cd /d "%~dp0"
echo ===================================================
echo Starting AI Job Recommendation Agent (India)
echo Running automatically every 55 minutes...
echo ===================================================
node src/index.js
pause
