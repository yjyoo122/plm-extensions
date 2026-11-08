@echo off
rem  Started by Chrome / Edge for the PLM UX Extensions browser extension, see host.js.
rem  Nothing in this file may print anything : its output is the message channel to the browser.
setlocal
set "PLMX_HOST_NODE=%~dp0..\runtime\node.exe"
if not exist "%PLMX_HOST_NODE%" set "PLMX_HOST_NODE=node"
"%PLMX_HOST_NODE%" "%~dp0host.js" %*
