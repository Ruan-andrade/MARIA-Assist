@echo off
cd /d "%~dp0"
title Gerador do Instalador MARIA
color 0d
echo ========================================================
echo       MARIA - COMPILADOR DE INSTALADOR (.EXE)
echo ========================================================
echo.
echo [1/3] Verificando dependencias locais...
if not exist node_modules (
    echo Instalando pacotes necessarios...
    call npm install
)

echo.
echo [2/3] Compilando frontend e empacotando instalador para Windows (.exe)...
call npm run dist:win

if %errorlevel% neq 0 (
    echo.
    echo [ERRO] A geracao do executavel falhou. Verifique se o Node.js esta atualizado.
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo [SUCESSO] Instalador gerado com exito!
echo Local do instalador:
echo   - Pasta: .\build-out\
echo   - Arquivo: MARIA HUD Setup 1.0.0.exe
echo ========================================================
echo.
explorer build-out
pause
