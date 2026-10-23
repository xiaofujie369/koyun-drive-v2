# Koyun Drive v2

[![Build & publish images](https://github.com/xiaofujie369/koyun-drive-v2/actions/workflows/docker.yml/badge.svg)](https://github.com/xiaofujie369/koyun-drive-v2/actions/workflows/docker.yml)

自托管的文件下载中心 / 网盘：给客户分发软件、安装包和资料，支持超大文件分片上传与断点续传。

| 部分 | 技术 |
| --- | --- |
| 后端 | Laravel 11 + Octane (Swoole 5.1, PHP 8.3) |
| 用户前台 | Vue 3 + TypeScript + Naive UI（`/`） |
| 管理后台 | React + shadcn/ui + Tailwind（`/admin`） |
| 数据 | MySQL 5.7，Redis 7（缓存 / Session / 限流），Octane Cache |
| 部署 | Docker Compose，镜像由 GitHub Actions 构建并发布到 GHCR |

## 功能

- **文件中心**：公开文件夹（可多级），搜索，图片/视频在线预览，复制直链
- **大文件上传**：分片上传（默认 8 MB/片），自动重试，暂停/继续，刷新页面后重新选择同一文件即可断点续传；可配置独立的上传域名绕过 CDN 上传大小限制
- **下载**：nginx 直接发送文件（支持 Range、断点续传、多线程下载），同一 IP 一小时内重复下载只计一次
- **分享**：文件或文件夹，提取码、有效期、下载次数上限
- **用户**：普通用户拥有自己的网盘空间和配额；可开放注册
- **管理后台**：仪表盘与趋势图、文件浏览与上传、全部文件、分享、上传任务、用户、下载/操作/登录日志、系统设置、系统状态

## 一键安装

需要一台 x86_64 Linux 服务器（1 核 2 GB 内存以上），root 用户执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/xiaofujie369/koyun-drive-v2/main/install.sh)
```

安装向导会自动安装 Docker、生成随机密钥、拉取预编译镜像并启动，最后打印管理员账号密码。三种部署方式：

| 方式 | 说明 |
| --- | --- |
| 1. 自动 HTTPS（推荐） | 内置 Caddy 占用 80/443，自动申请证书。需要域名已解析到服务器 |
| 2. 已有反向代理 | 程序只监听 `127.0.0.1:端口`，由你的 nginx / Caddy / 宝塔 转发（需传递 `X-Forwarded-For`、`X-Forwarded-Proto`，nginx 设置 `client_max_body_size 40m;`） |
| 3. 仅 HTTP | 直接用 `http://IP:端口` 访问，适合测试或内网 |

无人值守安装：

```bash
DOMAIN=pan.example.com UPLOAD_DOMAIN=upload.example.com MODE=caddy \
  bash <(curl -fsSL https://raw.githubusercontent.com/xiaofujie369/koyun-drive-v2/main/install.sh)
```

可用变量：`MODE`（caddy / proxy / http）、`DOMAIN`、`UPLOAD_DOMAIN`、`PORT`、`INSTALL_DIR`（默认 `/opt/koyun-drive`）、`ADMIN_USER`（默认 `admin`）、`IMAGE_TAG`（默认 `latest`，也可固定为如 `1.0.0`）。

> **使用 Cloudflare 等 CDN 时**：网站域名可以开启 CDN（橙云）。如需上传专用域名，它必须**直接解析到服务器（灰云 / DNS only）**，否则仍受 CDN 单请求 100 MB 限制。分片默认 8 MB，即使不配置上传域名也能正常上传大文件。

## 升级

再次运行安装命令即可（检测到已安装会自动拉取新镜像并重启，数据保留）：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/xiaofujie369/koyun-drive-v2/main/install.sh)
```

## 日常运维

在安装目录（默认 `/opt/koyun-drive`）下：

```bash
docker compose ps
docker compose logs -f app
docker compose exec app php artisan drive:admin admin    # 新建/重置管理员，打印随机密码
docker compose exec app php artisan drive:cleanup        # 清理过期上传（已每小时自动执行）
```

数据都在 `data/` 目录：`data/storage/files`（文件）、`data/mysql`、`data/redis`、`data/logs`。备份：

```bash
cd /opt/koyun-drive
docker compose exec -T mysql sh -c 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > backup.sql
tar czf files-$(date +%F).tar.gz data/storage/files
```

## 从源码构建

```bash
git clone https://github.com/xiaofujie369/koyun-drive-v2.git && cd koyun-drive-v2
cp .env.example .env    # 填写 APP_KEY（base64:随机32字节）、APP_URL、各项密码
mkdir -p data/storage/files data/storage/tmp data/logs && chown -R 33:33 data/storage data/logs
docker compose up -d --build     # 默认监听 127.0.0.1:8196，可用 WEB_BIND 修改
docker compose exec app php artisan drive:admin admin
```

推送到 `main` 分支会由 GitHub Actions 构建 `ghcr.io/xiaofujie369/koyun-drive-v2:app-latest` 和 `:web-latest`；推送 `v1.2.3` 这样的标签会额外发布 `app-1.2.3` / `web-1.2.3`。

## 架构要点

- API 位于 `/kd/`（不用 `/api/`，因为部分 Cloudflare 规则会拦截 `/api` 路径）。
- 上传：`POST /kd/uploads` 建会话 → `PUT /kd/uploads/{id}/chunks/{n}`（原始分片）→ `POST /kd/uploads/{id}/complete`。分片直接写入稀疏临时文件的对应偏移，完成时仅 `rename`。分片请求不带 Cookie，靠每个会话的 `X-Upload-Token` 授权，因此可跨域发送到上传域名；上传域名不可用时浏览器自动回退到当前域名。
- 下载：Laravel 只做鉴权和计数，文件字节由 nginx 通过 `X-Accel-Redirect` 发送，不占用 PHP worker。
- 文件夹自身及所有上级都设为「公开」时出现在前台文件中心。
