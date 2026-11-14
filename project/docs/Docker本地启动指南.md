# Docker Desktop 本地启动指南

此配置在电脑上运行 AIHot 和一套独立的 MySQL。网页默认使用 **8787** 端口，MySQL 从电脑访问使用 **3308** 端口；两个端口默认仅绑定本机地址。

## 1. 准备

1. 打开 Docker Desktop，等待引擎启动。
2. 在项目根目录找到 `.env.docker.local`。首次执行启动脚本时，如果该文件不存在，会根据 `.env.docker.example` 创建，并自动生成数据库密码；再次执行不会覆盖已有配置。
3. 如需 AI 分析，请将自己新生成的百炼 Key 填入 `.env.docker.local` 的 `BAILIAN_API_KEY=`；无需 AI 时留空也能使用规则匹配。该文件含密码和密钥，不要提交到 Git 或发送给他人。

Docker 配置与项目原来的 `.env` 分开；不会读取原 `.env` 中的 MySQL 密码或百炼 Key。

## 2. 启动

在项目根目录双击 `启动Docker本地.cmd`。首次需要构建镜像，并可能从镜像仓库、npm 和 Maven 下载依赖，时间取决于网络。

脚本会先启动 MySQL，再构建并启动应用。即使后续应用镜像构建失败，仍可在 Docker Desktop 中看到已启动的 MySQL 容器。也可以在项目根目录的 PowerShell 中执行：

```powershell
node project/scripts/setup-docker.cjs
docker compose --env-file .env.docker.local -f compose.local.yaml up -d mysql
docker compose --env-file .env.docker.local -f compose.local.yaml up -d --build app
docker compose --env-file .env.docker.local -f compose.local.yaml ps
```

应用容器运行后，访问 <http://127.0.0.1:8787>。数据库需要初始化，状态由 starting 变为 healthy 可能需要一点时间。`SCHEDULER_ENABLED` 默认是 `false`，可以先手动检索，之后按需设为 `true` 并重新启动。

## 3. 连接数据库

在 Navicat、MySQL Workbench 等工具中使用：

- 主机：`127.0.0.1`
- 端口：`3308`
- 数据库：`aihot`
- 用户名：`root`
- 密码：`.env.docker.local` 中的 `DB_PASSWORD`

Spring Boot 容器使用 Docker 内部地址 `mysql:3306`，不需要改成 3308。首次启动时 MySQL 镜像会创建数据库和业务账号，Spring Boot 会初始化业务表。

## 4. 查看与停止

```powershell
# 查看容器状态
docker compose --env-file .env.docker.local -f compose.local.yaml ps
# 查看应用日志，按 Ctrl+C 退出日志查看
docker compose --env-file .env.docker.local -f compose.local.yaml logs -f app
# 停止并移除容器，保留数据库卷
docker compose --env-file .env.docker.local -f compose.local.yaml down
```

本地数据库存放在 Docker 命名卷 `aihot-local_mysql-data`，与现有数据库及服务器 Compose 卷分开。不要使用 `down -v`，该选项会删除卷里的数据库。已有卷初始化后，修改配置文件里的密码不会自动修改数据库中的密码；应使用 MySQL 的账号管理方式更新。

如果本机 3308 或 8787 已被占用，可在 `.env.docker.local` 修改 `MYSQL_PORT` 或 `APP_PORT`，再重新执行启动命令。需要访问 AI 服务时，也要检查模型、Key 和地域地址是否对应。

## 5. 常见问题

- **无法连接 Docker engine**：先打开 Docker Desktop 并等待引擎就绪；若仍提示权限不足，请检查当前 Windows 用户对 Docker Desktop 的访问权限。
- **镜像或依赖下载失败**：检查电脑访问 Docker 镜像仓库、npm 和 Maven 的网络后重试。
- **网页打不开**：用 `ps` 查看容器状态，检查 app 日志，并确认网页访问的是 8787，而不是数据库端口 3308。
- **连接 MySQL 被拒绝**：确认 mysql 容器已健康启动、连接的是本机 3308，并核对 `.env.docker.local` 中的账号和密码。
