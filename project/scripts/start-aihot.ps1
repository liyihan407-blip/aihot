param([switch]$Rebuild)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location -LiteralPath $projectRoot
& (Join-Path $projectRoot "project/scripts/setup-config.ps1")
$configPath = Join-Path $projectRoot ".env"
$configText = [IO.File]::ReadAllText($configPath)
if ($configText -notmatch '(?m)^DB_USERNAME=') {
    throw "未找到 MySQL 用户名。请打开 $configPath，填写 DB_USERNAME。详见 project/docs/配置与启动指南.md。"
}
if (-not $env:DB_PASSWORD -and $configText -match '(?m)^DB_PASSWORD=请填写') {
    throw "MySQL 密码还是示例内容。请打开 $configPath，把 DB_PASSWORD 等号后的内容改成你自己的密码。详见 project/docs/配置与启动指南.md。"
}
# Java 启动适配器会寻找 JAVA_HOME 或用户 .jdks 中的 JDK 21。
$jarPath = Join-Path $projectRoot "backend/target/aihot-1.0.0.jar"
if ($Rebuild -or -not (Test-Path -LiteralPath $jarPath)) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "node_modules"))) {
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "前端依赖安装失败，请检查网络后重试。" }
    }
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "构建失败，请查看上面的错误信息。" }
}
$port = "8787"
if ($env:PORT) { $port = $env:PORT }
elseif ($configText -match '(?m)^PORT=(\d+)') { $port = $matches[1] }
Write-Host ""
Write-Host "正在启动 AIHot Java 版。启动成功后访问：http://127.0.0.1:$port"
Write-Host "本窗口显示日志；按 Ctrl+C 停止。修改代码后使用 -Rebuild 重新打包。"
& node (Join-Path $projectRoot "project/scripts/run-jar.cjs")
if ($LASTEXITCODE -ne 0) { throw "Java 服务未正常启动，请查看日志及启动指南中的排错步骤。" }
