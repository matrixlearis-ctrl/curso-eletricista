@echo off
setlocal
title Curso de Eletricista - servidor local
cd /d "%~dp0"

rem Se o servidor ja estiver rodando, apenas abre o navegador.
netstat -ano | findstr /c:":3000" | findstr /i "LISTENING" >nul
if not errorlevel 1 goto jarodando

where node >nul 2>nul
if errorlevel 1 goto semnode

if not exist node_modules (
  echo Instalando dependencias, aguarde...
  call npm install --no-audit --no-fund
)

if not exist .env copy .env.example .env >nul

start "" /b cmd /c "ping -n 4 127.0.0.1 >nul & explorer http://localhost:3000"

echo.
echo  Curso de Eletricista
echo  Abrindo http://localhost:3000 no navegador...
echo  Para parar o servidor, pressione Ctrl+C ou feche esta janela.
echo.

node server.js
echo.
echo  O servidor parou. Se houve erro, ele esta na mensagem acima.
pause
goto :eof

:jarodando
echo.
echo  O servidor JA ESTA RODANDO em http://localhost:3000
echo  Abrindo o navegador...
start "" http://localhost:3000
timeout /t 3 >nul
goto :eof

:semnode
echo.
echo  Node.js nao encontrado neste computador.
echo  Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
echo.
pause