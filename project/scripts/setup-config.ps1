$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$templatePath = Join-Path $projectRoot ".env.example"
$configPath = Join-Path $projectRoot ".env"
if (-not (Test-Path -LiteralPath $configPath)) {
    Copy-Item -LiteralPath $templatePath -Destination $configPath
    Write-Host "已生成 .env，请填写 MySQL 连接信息。"
    return
}
# 保留原来的 Key 和密码，只补上新版缺少的配置及注释。
$existing = [IO.File]::ReadAllText($configPath)
$knownKeys = @{}
foreach ($line in ($existing -split "\r?\n")) {
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)\s*=') { $knownKeys[$matches[1]] = $true }
}
$notes = @()
$addition = @()
foreach ($line in ([IO.File]::ReadAllText($templatePath) -split "\r?\n")) {
    if ($line -match '^([A-Z][A-Z0-9_]*)=') {
        if (-not $knownKeys.ContainsKey($matches[1])) { $addition += ""; $addition += $notes; $addition += $line }
        $notes = @()
    } else { $notes += $line }
}
if ($addition.Count -gt 0) {
    $nl = [Environment]::NewLine
    [IO.File]::AppendAllText($configPath, $nl + "# 以下为 Java 版补充配置，原配置保持不变。" + $nl + ($addition -join $nl) + $nl, [Text.UTF8Encoding]::new($false))
    Write-Host "已补充新版缺失配置，原来的值未覆盖。"
} else { Write-Host ".env 配置项完整，未修改文件。" }
