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
rem  of that file as its only argument : "bin\www tokyo" reads environments\tokyo.js. The setup wizard
rem  writes those files, this block is what lets the user pick one without ever opening a terminal.
rem
rem  When no profile file exists nothing is printed and nothing is asked, and the app starts exactly as it
rem  did before this block was added, on environment.js. That keeps the single tenant installation - which
rem  is what most people have - completely unchanged.
rem
rem  The picker runs ONCE, above the supervisor loop further down. The restart the setup wizard triggers
rem  with exit code 42 therefore silently reuses the profile chosen here instead of asking again.
rem
rem  template.js is the documented example file and is never a tenant, and the wizard keeps timestamped
rem  copies named <profile>.backup-<stamp>.js next to the originals. Neither belongs in the menu.

set "PLMX_PROFILE="
set "PLMX_ENVIRONMENT=!PLMX_HOME!environment.js"
set "PLMX_LASTFILE=!PLMX_HOME!.plmx-last-profile"
set /a PLMX_COUNT=0

for /f "delims=" %%f in ('dir /b /a:-d "!PLMX_HOME!environments\*.js" 2^>nul ^| findstr /v /i /c:".backup-"') do (
    if /i not "%%~nxf"=="template.js" (
        set /a PLMX_COUNT+=1
        set "PLMX_NAME_!PLMX_COUNT!=%%~nf"
        set "PLMX_LABEL_!PLMX_COUNT!=%%~nf"
        rem  Best effort only : the tenant is shown next to the file name so the user recognises the
        rem  profile. A file written by hand may quote its values differently, in which case nothing
        rem  matches and the plain file name is shown.
        for /f "usebackq tokens=2 delims='" %%t in (`findstr /b /c:"exports.tenant" "!PLMX_HOME!environments\%%~nxf" 2^>nul`) do (
            if not "%%t"==";" set "PLMX_LABEL_!PLMX_COUNT!=%%~nf   -   tenant %%t"
        )
    )
)

if !PLMX_COUNT! EQU 0 goto :plmx_profile_ready

set "PLMX_LAST="
if exist "!PLMX_LASTFILE!" set /p "PLMX_LAST="<"!PLMX_LASTFILE!"

set "PLMX_DEFAULT=0"
if defined PLMX_LAST for /l %%i in (1,1,!PLMX_COUNT!) do if /i "!PLMX_NAME_%%i!"=="!PLMX_LAST!" set "PLMX_DEFAULT=%%i"

set /a PLMX_TRIES=0


:plmx_pick

echo.
echo   Which tenant do you want to work with?
echo.

for /l %%i in (1,1,!PLMX_COUNT!) do (
    set "PLMX_MARK= "
    if "%%i"=="!PLMX_DEFAULT!" set "PLMX_MARK=*"
    echo    !PLMX_MARK!  %%i^)  !PLMX_LABEL_%%i!
)

set "PLMX_MARK= "
if "0"=="!PLMX_DEFAULT!" set "PLMX_MARK=*"
echo    !PLMX_MARK!  0^)  Default connection settings ^(environment.js^)

echo.
echo      *  marks what you used last time. Press Ctrl+C to close this window instead.
echo.

rem  set /p prints its prompt with the leading spaces removed, so the prompt below is written without
rem  the indentation used everywhere else on purpose - it would be dropped anyway.
set "PLMX_CHOICE="
set /p "PLMX_CHOICE=Type a number and press Enter, or press Enter for !PLMX_DEFAULT! : "

if not defined PLMX_CHOICE set "PLMX_CHOICE=!PLMX_DEFAULT!"

rem  A typed double quote is removed before anything else looks at the answer. Left in place it would
rem  unbalance the quoting of the comparisons below, and an unbalanced comparison is a syntax error that
rem  cmd prints and then walks straight past, which is how a batch file ends up doing something random.
set PLMX_CHOICE=!PLMX_CHOICE:"=!

if not defined PLMX_CHOICE goto :plmx_pick_invalid

rem  What was typed is proven to be nothing but digits here, before it reaches a command that could
rem  treat any of it as syntax. Every digit is removed from a copy, and whatever is left has to be the
rem  marker that copy started with. findstr is deliberately not used : piping to it starts two child
rem  processes which inherit this window's input, and those swallow anything typed ahead. The marker
rem  is not decoration either, it keeps the copy from ever becoming empty - expanding an undefined
rem  variable with a replacement, !undefined:3=!, leaves the text 3= behind instead of nothing.
set "PLMX_TEST=x!PLMX_CHOICE!"
for %%d in (0 1 2 3 4 5 6 7 8 9) do set "PLMX_TEST=!PLMX_TEST:%%d=!"

if not "!PLMX_TEST!"=="x" goto :plmx_pick_invalid
if !PLMX_CHOICE! GTR !PLMX_COUNT! goto :plmx_pick_invalid

for /f %%i in ("!PLMX_CHOICE!") do set "PLMX_PROFILE=!PLMX_NAME_%%i!"

if not defined PLMX_PROFILE goto :plmx_profile_save

set "PLMX_ENVIRONMENT=!PLMX_HOME!environments\!PLMX_PROFILE!.js"

if not exist "!PLMX_ENVIRONMENT!" (
    echo.
    echo   The file environments\!PLMX_PROFILE!.js is not there any more. Please pick another entry.
    goto :plmx_pick_retry
)

rem  A profile whose file has a typo in it would otherwise end in a Node stack trace after the browser
rem  has already been opened. Loading it here costs a few milliseconds and turns that into one sentence.
"!PLMX_NODE!" -e "require(process.argv[1])" "!PLMX_ENVIRONMENT!" >nul 2>&1
if errorlevel 1 (
    echo.
    echo   The file environments\!PLMX_PROFILE!.js cannot be read - it contains a typo, most likely a
    echo   missing quote or semicolon. Open it in Notepad and compare it with environments\template.js,
    echo   or pick another entry.
    goto :plmx_pick_retry
)

goto :plmx_profile_save


:plmx_pick_invalid

echo.
echo   That was not one of the numbers in the list.

:plmx_pick_retry

set /a PLMX_TRIES+=1
if !PLMX_TRIES! LSS 10 goto :plmx_pick

rem  Reached when this window has no keyboard behind it at all, for example when the script is started
rem  from a scheduler. Looping forever on an input that never arrives would leave a stuck process.
echo.
echo   No usable answer was given, starting with the default connection settings instead.
set "PLMX_PROFILE="
set "PLMX_ENVIRONMENT=!PLMX_HOME!environment.js"


:plmx_profile_save

rem  Remembered for the next start. The redirection is first on the line on purpose : a profile name
rem  ending in a digit would turn "echo name>file" into a redirection of that stream number instead.
rem  A folder the user cannot write to only costs the memory of the last choice, so the error is dropped.
2>nul >"!PLMX_LASTFILE!" echo(!PLMX_PROFILE!


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

rem  The profile name is passed on as the only argument, which is what makes the server read
rem  environments\<profile>.js instead of environment.js. It is deliberately re-read from the variable on
rem  every pass of this loop, so the restart requested by the setup wizard keeps the same tenant.
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
