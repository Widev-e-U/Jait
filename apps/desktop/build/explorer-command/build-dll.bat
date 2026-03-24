@echo off
REM Build the Jait explorer command DLL (IExplorerCommand for Win11 modern context menu).
REM Requires Visual Studio Build Tools (cl.exe) on PATH.
REM
REM Usage:  build-dll.bat [x64|arm64]

setlocal
set ARCH=%~1
if "%ARCH%"=="" set ARCH=x64

set OUT=jait_explorer_command_%ARCH%.dll

echo Building %OUT% ...

cl /nologo /LD /EHsc /O2 /DUNICODE /D_UNICODE ^
   /DWIN32 /D_WINDOWS ^
   explorer-command.cpp ^
   explorer-command.def ^
   ole32.lib shell32.lib shlwapi.lib advapi32.lib ^
   /Fe:%OUT% /link /DEF:explorer-command.def

if errorlevel 1 (
    echo ERROR: Compilation failed.
    exit /b 1
)

echo Built %OUT% successfully.
