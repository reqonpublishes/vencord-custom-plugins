@echo off
setlocal EnableExtensions
title Vencord Custom Plugins - installer

:: ---------------------------------------------------------------------------
::  Installs these plugins into a Vencord build and points Discord at it.
::
::  Everything it does, you could type by hand - see the README. It only ever
::  touches the two folders named below, plus Discord's own install when it
::  runs "pnpm inject" at the end.
::
::  Options:
::    --no-inject     build everything but don't touch Discord. Use this on
::                    Vesktop or the browser build, which are set up differently.
::
::  Both folders can be moved by setting VENCORD_DIR / PLUGINS_DIR first.
:: ---------------------------------------------------------------------------

set "VENCORD_URL=https://github.com/Vendicated/Vencord"
set "PLUGINS_URL=https://github.com/reqonpublishes/vencord-custom-plugins"

if not defined VENCORD_DIR set "VENCORD_DIR=%USERPROFILE%\Vencord"
if not defined PLUGINS_DIR set "PLUGINS_DIR=%USERPROFILE%\vc-plugins"

set "SKIP_INJECT="
if /I "%~1"=="--no-inject" set "SKIP_INJECT=1"

echo.
echo   Vencord Custom Plugins
echo   ======================
echo.
echo   This will:
echo     1. install Node.js and Git, if you don't already have them
echo     2. download Vencord to  %VENCORD_DIR%
echo     3. download the plugins to  %PLUGINS_DIR%
echo     4. build Vencord with the plugins included
if not defined SKIP_INJECT echo     5. add that build to Discord
echo.
echo   Nothing outside those folders is changed. Close this window to stop.
echo.
pause

:: --- Git -------------------------------------------------------------------

set "NEED_RESTART="

where git >nul 2>&1
if errorlevel 1 (
    echo.
    echo   [1/5] Installing Git...
    winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements
    if errorlevel 1 goto :no_winget
    set "NEED_RESTART=1"
) else (
    echo.
    echo   [1/5] Git is already installed.
)

:: --- Node ------------------------------------------------------------------

set "NODE_MAJOR=0"
for /f "tokens=1 delims=." %%v in ('node -v 2^>nul') do set "NODE_MAJOR=%%v"
set "NODE_MAJOR=%NODE_MAJOR:v=%"

if %NODE_MAJOR% LSS 22 (
    echo   [2/5] Installing Node.js...
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    if errorlevel 1 goto :no_winget
    set "NEED_RESTART=1"
) else (
    echo   [2/5] Node.js %NODE_MAJOR% is already installed.
)

:: A program installed a moment ago isn't on this window's PATH yet - Windows
:: only hands that to new windows. Rather than guess at the paths, finish here
:: and let the second run sail through the checks above.
if defined NEED_RESTART (
    echo.
    echo   Done. This window can't see the new programs yet, so:
    echo.
    echo     close it, then run install.bat again to finish.
    echo.
    pause
    exit /b 0
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo         Installing pnpm...
    call npm install -g pnpm
    if errorlevel 1 goto :failed
)

:: --- Vencord ---------------------------------------------------------------

echo.
if exist "%VENCORD_DIR%\.git" (
    echo   [3/5] Updating Vencord...
    git -C "%VENCORD_DIR%" pull --ff-only
) else (
    echo   [3/5] Downloading Vencord...
    git clone "%VENCORD_URL%" "%VENCORD_DIR%"
    if errorlevel 1 goto :failed
)

:: --- Plugins ---------------------------------------------------------------

echo.
if exist "%PLUGINS_DIR%\.git" (
    echo   [4/5] Updating the plugins...
    git -C "%PLUGINS_DIR%" pull --ff-only
) else (
    echo   [4/5] Downloading the plugins...
    git clone "%PLUGINS_URL%" "%PLUGINS_DIR%"
    if errorlevel 1 goto :failed
)

if not exist "%VENCORD_DIR%\src\userplugins" mkdir "%VENCORD_DIR%\src\userplugins"
xcopy "%PLUGINS_DIR%\plugins\*" "%VENCORD_DIR%\src\userplugins\" /E /I /Y /Q >nul
if errorlevel 1 goto :failed

:: --- Build -----------------------------------------------------------------

echo.
echo   [5/5] Building. First time takes a few minutes.
echo.

pushd "%VENCORD_DIR%"

call pnpm install --frozen-lockfile
if errorlevel 1 goto :failed_here

call pnpm build
if errorlevel 1 goto :failed_here

if defined SKIP_INJECT (
    popd
    echo.
    echo   Built. Point your client at  %VENCORD_DIR%\dist
    echo.
    pause
    exit /b 0
)

:: --- Discord ---------------------------------------------------------------

tasklist /FI "IMAGENAME eq Discord.exe" 2>nul | find /I "Discord.exe" >nul
if not errorlevel 1 (
    echo.
    echo   Discord is still running, and it has to be closed for this bit.
    echo   Right-click its icon in the system tray, down by the clock,
    echo   and choose "Quit Discord" - closing the window isn't enough.
    echo.
    pause
)

call pnpm inject
if errorlevel 1 goto :failed_here

popd

echo.
echo   All done.
echo.
echo   Start Discord, open Settings ^> Vencord ^> Plugins, search for
echo   CustomPlugin, and switch on all three.
echo.
pause
exit /b 0

:: --- Failures --------------------------------------------------------------

:failed_here
popd
goto :failed

:no_winget
echo.
echo   Couldn't install that automatically.
echo.
echo   Install Node.js 22 or newer from https://nodejs.org and Git from
echo   https://git-scm.com/downloads, then run install.bat again.
echo.
pause
exit /b 1

:failed
echo.
echo   Something went wrong - the last message above says what.
echo   The README has a list of the usual causes:
echo   %PLUGINS_URL%#if-something-goes-wrong
echo.
pause
exit /b 1
