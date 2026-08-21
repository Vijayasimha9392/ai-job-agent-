@echo off
echo Stopping any running AI Job Agent instances...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq AI Job Recommendation Agent*" 2>nul
echo Done.
