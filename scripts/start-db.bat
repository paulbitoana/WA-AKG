@echo off
rem Start the portable MySQL server used for local development.
rem First-time setup (already done): .mysql\data initialized with root and no password.
setlocal
set "ROOT=%~dp0.."
set "MYSQL_HOME=%ROOT%\.mysql\mysql-8.0.42-winx64"
set "DATADIR=%ROOT%\.mysql\data"

if not exist "%MYSQL_HOME%\bin\mysqld.exe" (
    echo [start-db] Portable MySQL not found: %MYSQL_HOME%
    exit /b 1
)

powershell -NoProfile -Command "$c=New-Object Net.Sockets.TcpClient; try{$c.Connect('127.0.0.1',3306); exit 0}catch{exit 1}finally{$c.Close()}"
if %errorlevel%==0 (
    echo [start-db] MySQL is already running on port 3306.
    exit /b 0
)

echo [start-db] Starting MySQL...
start "MySQL" /min "%MYSQL_HOME%\bin\mysqld.exe" --console --basedir="%MYSQL_HOME%" --datadir="%DATADIR%"

rem Wait until the port answers (max ~30s)
powershell -NoProfile -Command "for($i=0;$i -lt 30;$i++){ $c=New-Object Net.Sockets.TcpClient; try{ $c.Connect('127.0.0.1',3306); $c.Close(); exit 0 }catch{ Start-Sleep 1 } }; exit 1"
if %errorlevel%==0 (
    echo [start-db] MySQL is running on port 3306.
) else (
    echo [start-db] MySQL did not answer on port 3306 within 30s - check the MySQL console window.
    exit /b 1
)
