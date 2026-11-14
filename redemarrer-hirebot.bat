@echo off
title HireBot - Rebuild et redemarrage

cd /d "%~dp0"

echo.
echo [1/5] Arret du conteneur...
docker stop hirebot 2>nul

echo.
echo [2/5] Suppression de l'ancien conteneur...
docker rm hirebot 2>nul

echo.
echo [3/5] Construction de l'image...
docker build -t hirebot .
if errorlevel 1 (
    echo.
    echo ERREUR : la construction Docker a echoue.
    pause
    exit /b 1
)

echo.
echo [4/5] Lancement du nouveau conteneur...
docker run -d --name hirebot --restart unless-stopped -p 8000:8000 hirebot
if errorlevel 1 (
    echo.
    echo ERREUR : le lancement du conteneur a echoue.
    pause
    exit /b 1
)

echo.
echo [5/5] Verification de l'API (attente 5 secondes)...
timeout /t 5 /nobreak >nul
curl -s http://localhost:8000/health
if errorlevel 1 (
    echo.
    echo ATTENTION : l'API ne repond pas. Dernieres lignes du journal :
    docker logs --tail 30 hirebot
    pause
    exit /b 1
)

echo.
echo.
echo HireBot est redemarre.
echo Site    : http://localhost:8000
echo API     : http://localhost:8000/docs
echo Sources : http://localhost:8000/sources
echo.
pause
