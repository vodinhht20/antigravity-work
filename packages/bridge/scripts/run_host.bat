@echo off
setlocal
set "BRIDGE_DIR=%~dp0.."
set "PYTHONPATH=%BRIDGE_DIR%;%PYTHONPATH%"
python -u -m agy_bridge.native_host
