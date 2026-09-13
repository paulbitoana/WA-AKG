@echo off
rem Stop the portable MySQL server.
setlocal
set "ROOT=%~dp0.."
set "MYSQL_HOME=%ROOT%\.mysql\mysql-8.0.42-winx64"

if not exist "%MYSQL_HOME%\bin\mysqladmin.exe" (
    echo [stop-db] Portable MySQL not found: %MYSQL_HOME%
    exit /b 1
)

"%MYSQL_HOME%\bin\mysqladmin.exe" -u root shutdown
if %errorlevel%==0 (
    echo [stop-db] MySQL stopped.
) else (
    echo [stop-db] Failed to stop MySQL - is it running?
    exit /b 1
)
