@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo 未找到 Node.js，请先安装 Node.js 后重试。
    goto failed
)

node project\scripts\setup-docker.cjs
if errorlevel 1 goto failed

echo 第一步：启动本地 MySQL，端口为 3308。
docker compose --env-file .env.docker.local -f compose.local.yaml up -d mysql
if errorlevel 1 goto failed

echo 第二步：构建并启动 AIHot，首次构建可能需要下载镜像和依赖。
docker compose --env-file .env.docker.local -f compose.local.yaml up -d --build app
if errorlevel 1 goto failed

docker compose --env-file .env.docker.local -f compose.local.yaml ps
echo.
echo 启动完成后，请在浏览器打开 http://127.0.0.1:8787
echo 如果修改了 APP_PORT，请使用配置中对应的网页端口。
pause
exit /b 0

:failed
echo.
echo 启动失败，请确认 Docker Desktop 已启动，然后查看上面的错误信息。
pause
exit /b 1
