@echo off
chcp 65001 >nul
title 计件管理系统 - 全自动构建发布引擎

where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_CMD=node"
) else (
    set "NODE_CMD=C:\Users\P16V\.gemini\antigravity-ide\brain\72d495a3-c1df-40d4-a749-5007e6b12fb6\tools\node\node.exe"
)

"%NODE_CMD%" scripts/build_all.cjs
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] 构建失败，请检查上方控制台报错信息！
    if "%1"=="" pause
    exit /b %errorlevel%
)

echo.
echo [SUCCESS] 打包全部完成！根目录【计件管理系统.exe】已是最新版本！
if "%1"=="" pause
