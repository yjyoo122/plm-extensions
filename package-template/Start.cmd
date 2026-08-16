@echo off
rem ---------------------------------------------------------------------------------------------------
rem  FUSION MANAGE UX  -  portable Windows launcher
rem ---------------------------------------------------------------------------------------------------
rem  This is deliberately a .cmd file and not a compiled .exe.
rem  An unsigned .exe downloaded from the internet is flagged by Windows SmartScreen and by most
rem  corporate antivirus products, which for the target user would mean a scary warning dialog or a
rem  silently quarantined file. A plain batch script triggers neither, stays readable and auditable by
rem  the customer's IT department, and needs no code signing certificate.
rem
rem  What this script does
rem    - starts the embedded Node runtime in runtime\node.exe, so nothing has to be installed
rem    - supervises it : exit code 42 means "the setup wizard saved new settings", so relaunch
rem    - opens the browser once, about two seconds after the first launch
rem    - keeps the shortcut icon working after the folder has been moved or copied elsewhere
rem ---------------------------------------------------------------------------------------------------

setlocal


rem  Secondary entry point : this script relaunches itself with these arguments to open the browser
rem  after a short delay without blocking the server start.
if /i "%~1"=="--open-browser" (
    ping -n 3 127.0.0.1 >nul 2>&1
    start "" "%~2"
    exit /b 0
)


rem  Switched to UTF-8 so Japanese and Korean folder and profile names print correctly. Its input is
rem  taken from nul because chcp is an external program : inheriting this window's input lets it consume
rem  what the user has already typed ahead, which would eat the answer to the tenant question below.
chcp 65001 <nul >nul 2>&1
title Fusion Manage UX  -  keep this window open while you work
cd /d "%~dp0"


rem  The own location is captured here, BEFORE delayed expansion is switched on. Percent expansion of
rem  %~dp0 is safe at this point, and reading the values back later as !PLMX_HOME! returns them verbatim.
rem  Referencing %~dp0 directly under delayed expansion would silently swallow an exclamation mark in
rem  the folder name, which the user is free to create.
set "PLMX_HOME=%~dp0"
set "PLMX_SELF=%~f0"
set "PLMX_NODE=%~dp0runtime\node.exe"

setlocal EnableDelayedExpansion


rem ---------------------------------------------------------------------------------------------------
rem  EMBEDDED NODE RUNTIME
rem ---------------------------------------------------------------------------------------------------

if not exist "!PLMX_NODE!" (
    echo.
    echo   The file runtime\node.exe is missing, so this copy of the app cannot start. Please unzip the
    echo   downloaded package again, keeping all folders together, and start it from the unzipped folder.
    echo.
    pause
    exit /b 1
)


rem ---------------------------------------------------------------------------------------------------
rem  DESKTOP SHORTCUT
rem ---------------------------------------------------------------------------------------------------
rem  A .lnk file stores an absolute path. The shortcut shipped in the zip therefore points at the folder
rem  used when the package was built. It is rewritten here whenever this folder has a new location, so
rem  the user can drag "Fusion Manage UX.lnk" onto their desktop and it keeps working.
rem
rem  PowerShell decides for itself whether anything changed, and saves only then. Doing the comparison
rem  here in batch would mean keeping the old path in a text file, and reading that back with set /p
rem  compares bytes under the current console code page - which silently mismatches as soon as the user
rem  extracts the package into a folder with Japanese or Korean characters in its name.
rem  The folder is handed over in the environment variable PLMX_HOME instead of being pasted into the
rem  command line, so an apostrophe, a dollar sign or a backtick in the folder name cannot break the call.
rem  The whole call is best effort : if it fails the app still starts, only the icon is not refreshed.

powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$d=$env:PLMX_HOME; $t=$d+'Start.cmd'; $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'Fusion Manage UX.lnk'); if($s.TargetPath -ne $t) { $s.TargetPath=$t; $s.WorkingDirectory=$d; $s.IconLocation=$d+'public\favicon.ico,0'; $s.Description='Fusion Manage UX - starts the local server and opens the apps'; $s.WindowStyle=1; $s.Save() }" >nul 2>&1


rem ---------------------------------------------------------------------------------------------------
rem  TENANT PROFILE
rem ---------------------------------------------------------------------------------------------------
rem  environment.js holds the connection settings of ONE tenant. Somebody who demonstrates to several
rem  customers keeps one file per tenant in the folder environments\ instead. The server accepts the name
rem  of that file as its only argument : "bin\www tokyo" reads environments\tokyo.js.
rem
rem  Which one is used is NOT asked here. This window is not where a non-technical user should be making
rem  decisions, so the app always starts on whatever the setup wizard recorded in .plmx-profile, and the
rem  wizard is the single place where a tenant is chosen or switched. An empty or missing file means the
rem  default settings in environment.js, which is also what a fresh installation gets.
rem
rem  The value is read again on every pass of the supervisor loop further down, so switching tenant in
rem  the wizard - which ends the process with exit code 42 - comes back up on the newly chosen one.

set "PLMX_PROFILEFILE=!PLMX_HOME!.plmx-profile"
set "PLMX_PROFILE="
set "PLMX_ENVIRONMENT=!PLMX_HOME!environment.js"

set "PLMX_SAIDIT="
call :plmx_read_profile
set "PLMX_SAIDIT=1"

goto :plmx_profile_ready


:plmx_read_profile

rem  Reads .plmx-profile and proves the profile it names is actually usable. Anything wrong with it
rem  falls back to the default settings rather than failing the launch : a missing or broken profile
rem  must never leave the user with a window that closes again.
rem
rem  This runs twice for the first launch - once to work out the port for the browser, once at the top
rem  of the supervisor loop - and both reads see the same file. PLMX_SAIDIT is what keeps a complaint
rem  about that one file from being printed to the user twice in a row.

set "PLMX_PROFILE="
set "PLMX_ENVIRONMENT=!PLMX_HOME!environment.js"

if not exist "!PLMX_PROFILEFILE!" goto :eof

set /p "PLMX_PROFILE="<"!PLMX_PROFILEFILE!"

if not defined PLMX_PROFILE goto :eof

rem  Only the characters the wizard allows in a profile name. Anything else is treated as a damaged
rem  file, because the name is about to become part of a path.
echo !PLMX_PROFILE!|findstr /r /c:"^[A-Za-z0-9_-][A-Za-z0-9_-]*$" >nul 2>&1
if errorlevel 1 (
    if not defined PLMX_SAIDIT (
        echo.
        echo   The remembered tenant name is not readable, starting on the default settings instead.
        echo.
    )
    set "PLMX_PROFILE="
    goto :eof
)

if not exist "!PLMX_HOME!environments\!PLMX_PROFILE!.js" (
    if not defined PLMX_SAIDIT (
        echo.
        echo   The tenant !PLMX_PROFILE! is no longer there, starting on the default settings instead.
        echo   Open the setup wizard to choose another tenant.
        echo.
    )
    set "PLMX_PROFILE="
    goto :eof
)

rem  A profile whose file has a typo in it would otherwise end in a Node stack trace after the browser
rem  has already been opened. Loading it here costs a few milliseconds and turns that into one sentence.
"!PLMX_NODE!" -e "require(process.argv[1])" "!PLMX_HOME!environments\!PLMX_PROFILE!.js" >nul 2>&1
if errorlevel 1 (
    if not defined PLMX_SAIDIT (
        echo.
        echo   The file environments\!PLMX_PROFILE!.js cannot be read - it contains a typo, most likely a
        echo   missing quote or semicolon. Starting on the default settings instead.
        echo.
    )
    set "PLMX_PROFILE="
    goto :eof
)

set "PLMX_ENVIRONMENT=!PLMX_HOME!environments\!PLMX_PROFILE!.js"

goto :eof


:plmx_profile_ready


rem ---------------------------------------------------------------------------------------------------
rem  PORT
rem ---------------------------------------------------------------------------------------------------
rem  The server derives its port and protocol from the redirect URI of the environment file it was given,
rem  unless the PORT environment variable overrides the port. The same order is used here so the browser
rem  opens on the right address even after the setup wizard has changed it, and so that two profiles
rem  listening on different ports both open correctly.

set "PLMX_SCHEME=http"
set "PLMX_PORT=8080"

findstr /b /c:"exports.redirectUri" "!PLMX_ENVIRONMENT!" 2>nul | findstr /c:"https://" >nul 2>&1
if not errorlevel 1 set "PLMX_SCHEME=https"

for /f "tokens=3 delims=:" %%p in ('findstr /b /c:"exports.redirectUri" "!PLMX_ENVIRONMENT!" 2^>nul') do (
    for /f "tokens=1 delims=/" %%q in ("%%p") do set "PLMX_PORT=%%q"
)

if defined PORT set "PLMX_PORT=%PORT%"

echo !PLMX_PORT!|findstr /r /c:"^[0-9][0-9]*$" >nul 2>&1
if errorlevel 1 set "PLMX_PORT=8080"

set "PLMX_URL=!PLMX_SCHEME!://localhost:!PLMX_PORT!/"


rem ---------------------------------------------------------------------------------------------------
rem  PORT ALREADY IN USE
rem ---------------------------------------------------------------------------------------------------
rem  Checked up front so the user reads a sentence instead of a Node stack trace.

netstat -ano -p TCP 2>nul | findstr /c:"LISTENING" | findstr /c:":!PLMX_PORT! " >nul 2>&1
if not errorlevel 1 (
    echo.
    echo   Port !PLMX_PORT! on this computer is already being used by another program.
    echo   This usually means the app is already running - look for another black window,
    echo   or simply open !PLMX_URL! in your browser.
    echo.
    echo   If the app is not running, close the other program using port !PLMX_PORT! and try again.
    echo.
    pause
    exit /b 1
)


rem ---------------------------------------------------------------------------------------------------
rem  START
rem ---------------------------------------------------------------------------------------------------
rem  PLMX_SUPERVISED tells the setup wizard that a supervisor is watching, so it is allowed to end the
rem  process with exit code 42 to have its new settings applied.

set "PLMX_SUPERVISED=1"
set /a PLMX_RESTARTS=0

echo.
echo   Fusion Manage UX is starting up.
if defined PLMX_PROFILE echo   Using the tenant profile !PLMX_PROFILE!.
echo   Your browser will open at !PLMX_URL! in a moment.
echo.
echo   Keep this window open while you work. Closing it stops the app.
echo.

rem  Opened once only, before the supervisor loop, so a restart by the setup wizard does not open
rem  a second browser tab.
rem  Two quoting rules matter on this single line. START takes its switches before the window title, so
rem  /b comes first. And the URL is passed WITHOUT quotes on purpose : START runs a batch file through
rem  cmd /c, which strips the first and the last quote of the command line whenever more than one
rem  argument is quoted. Quoting the URL as well would mangle the path and the launch would fail with
rem  "is not recognized as an internal or external command". A URL never contains a space, so leaving
rem  it bare is safe.
start /b "" "!PLMX_SELF!" --open-browser !PLMX_URL!


:plmx_launch

rem  .plmx-profile is re-read on every pass, NOT just once before the loop. Switching tenant in the
rem  setup wizard writes that file and ends the process with exit code 42, so this is what makes the
rem  app come back up on the tenant the user just picked instead of the one it started with.
rem
rem  PLMX_SAIDIT is set on entry to this loop only, so that a complaint already printed by the read
rem  above - the two reads of the first launch see the same file - is not repeated straight away. It
rem  is cleared again below, because a LATER pass reads a file the wizard has just rewritten and a
rem  problem with that new tenant does have to be reported.
call :plmx_read_profile
set "PLMX_SAIDIT="

rem  The profile name is passed on as the only argument, which is what makes the server read
rem  environments\<profile>.js instead of environment.js.
if defined PLMX_PROFILE (
    "!PLMX_NODE!" --max-http-header-size=16384 ".\bin\www" "!PLMX_PROFILE!"
) else (
    "!PLMX_NODE!" --max-http-header-size=16384 ".\bin\www"
)

set "PLMX_CODE=!ERRORLEVEL!"

if "!PLMX_CODE!"=="42" (

    set /a PLMX_RESTARTS+=1

    if !PLMX_RESTARTS! GTR 10 (
        echo.
        echo   The app restarted 10 times in a row without settling down. Something in the settings
        echo   keeps failing. Please contact your administrator and mention this message.
        echo.
        pause
        exit /b 1
    )

    echo.
    echo   Applying your new settings and restarting, please wait.
    echo.

    goto :plmx_launch

)

if "!PLMX_CODE!"=="0"           goto :plmx_done
if "!PLMX_CODE!"=="-1073741510" goto :plmx_done
if "!PLMX_CODE!"=="3221225786"  goto :plmx_done

echo.
echo   The app stopped unexpectedly with error code !PLMX_CODE!.
echo   The lines above this message explain what went wrong. Please take a screenshot of them
echo   before closing this window, then start the app again.
echo.
pause

:plmx_done

endlocal
exit /b 0
