#!/usr/bin/env bash
# Koyun Drive v2 — one-click installer (Debian/Ubuntu/CentOS/Rocky/Alma, x86_64)
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/xiaofujie369/koyun-drive-v2/main/install.sh)
#
# Non-interactive: set env vars first, e.g.
#   DOMAIN=pan.example.com UPLOAD_DOMAIN=upload.example.com MODE=caddy bash install.sh
#
#   MODE=caddy   bundled Caddy with automatic HTTPS on 80/443 (needs a domain pointing here)
#   MODE=proxy   listen on 127.0.0.1:PORT, put your own nginx/Caddy/宝塔 in front (HTTPS)
#   MODE=http    plain http://IP:PORT, no domain needed (testing / intranet)
set -euo pipefail

REPO="xiaofujie369/koyun-drive-v2"
BRANCH="${BRANCH:-main}"
RAW="https://raw.githubusercontent.com/${REPO}/${BRANCH}"
DIR="${INSTALL_DIR:-/opt/koyun-drive}"
ADMIN_USER="${ADMIN_USER:-admin}"

c() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info() { c '1;32' "==> $*"; }
warn() { c '1;33' "!!  $*"; }
die() { c '1;31' "xx  $*"; exit 1; }
ask() { # ask VAR "prompt" default
  local __v="$1" __p="$2" __d="${3:-}" __a
  if [ -n "${!__v:-}" ]; then return; fi
  if [ -t 0 ] || [ -e /dev/tty ]; then
    read -r -p "$__p${__d:+ [$__d]}: " __a </dev/tty || true
  fi
  printf -v "$__v" '%s' "${__a:-$__d}"
}
# (no early-exiting readers in these pipelines: pipefail would turn SIGPIPE into an error)
rand() { head -c 512 /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' | cut -c1-32; }
port_free() {
  local listening
  listening="$( (ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null) | awk '{print $4}')"
  ! grep -qE "[:.]$1\$" <<<"$listening"
}

[ "$(id -u)" = 0 ] || die "请使用 root 运行（sudo -i）"
[ "$(uname -m)" = x86_64 ] || warn "预编译镜像为 x86_64 (amd64)，当前架构 $(uname -m) 可能无法运行，可改用源码构建"

# ---------------------------------------------------------------- docker
if ! command -v docker >/dev/null 2>&1; then
  info "安装 Docker ..."
  curl -fsSL https://get.docker.com | sh || die "Docker 安装失败，请手动安装后重试"
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker compose version >/dev/null 2>&1 || die "需要 Docker Compose v2（docker compose），请升级 Docker"

# ---------------------------------------------------------------- upgrade
if [ -f "$DIR/.env" ]; then
  info "检测到已安装于 $DIR，执行升级"
  cd "$DIR"
  curl -fsSL "$RAW/deploy/docker-compose.yml" -o docker-compose.yml
  PROFILE=""; [ -f Caddyfile ] && PROFILE="--profile caddy"
  docker compose $PROFILE pull
  docker compose $PROFILE up -d --remove-orphans
  info "升级完成"; exit 0
fi

# ---------------------------------------------------------------- questions
PUBLIC_IP="$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
echo
c '1;36' "Koyun Drive v2 安装向导"
echo "  1) 自动 HTTPS（内置 Caddy，占用 80/443，需要域名已解析到本机） — 推荐"
echo "  2) 已有 nginx / Caddy / 宝塔 等反向代理（本程序只监听 127.0.0.1）"
echo "  3) 仅 HTTP（用 IP 访问，适合测试/内网）"
if [ -z "${MODE:-}" ]; then
  def=1; { port_free 80 && port_free 443; } || def=2
  ask CHOICE "请选择部署方式" "$def"
  case "$CHOICE" in 1) MODE=caddy ;; 2) MODE=proxy ;; 3) MODE=http ;; *) die "无效选择" ;; esac
fi

case "$MODE" in
  caddy|proxy)
    ask DOMAIN "网站域名（访客访问的地址，如 pan.example.com）" ""
    [ -n "$DOMAIN" ] || die "需要域名"
    ask UPLOAD_DOMAIN "上传专用域名（可选，CDN 有上传大小限制时使用，直接回车跳过）" ""
    SCHEME=https ;;
  http)
    ask PORT "监听端口" "8096"
    DOMAIN="${PUBLIC_IP}:${PORT}"; UPLOAD_DOMAIN=""; SCHEME=http ;;
  *) die "MODE 只能是 caddy / proxy / http" ;;
esac
if [ "$MODE" = proxy ]; then ask PORT "本地监听端口（反向代理到 127.0.0.1:端口）" "8096"; fi
if [ "$MODE" = caddy ]; then { port_free 80 && port_free 443; } || die "80/443 已被占用，请选择方式 2（已有反向代理）"; fi

APP_URL="${SCHEME}://${DOMAIN}"
UPLOAD_URL=""; CORS="$APP_URL"
if [ -n "${UPLOAD_DOMAIN:-}" ]; then UPLOAD_URL="https://${UPLOAD_DOMAIN}"; CORS="$APP_URL,$UPLOAD_URL"; fi
case "$MODE" in
  caddy) WEB_BIND="127.0.0.1:8096" ;;
  proxy) WEB_BIND="127.0.0.1:${PORT}" ;;
  http)  WEB_BIND="0.0.0.0:${PORT}" ;;
esac

# ---------------------------------------------------------------- files
info "安装目录 $DIR"
mkdir -p "$DIR" && cd "$DIR"
curl -fsSL "$RAW/deploy/docker-compose.yml" -o docker-compose.yml || die "下载 docker-compose.yml 失败"

umask 077
cat > .env <<EOF
APP_NAME="Koyun Drive"
APP_ENV=production
APP_KEY=base64:$(head -c 32 /dev/urandom | base64)
APP_DEBUG=false
APP_TIMEZONE=${TZ_NAME:-Asia/Shanghai}
APP_URL=${APP_URL}
APP_LOCALE=zh_CN
LOG_CHANNEL=stack
LOG_STACK=daily
LOG_LEVEL=warning
LOG_DAILY_DAYS=14

DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=koyun_drive
DB_USERNAME=drive
DB_PASSWORD=$(rand)
MYSQL_ROOT_PASSWORD=$(rand)

REDIS_CLIENT=phpredis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$(rand)
REDIS_PREFIX=koyun_drive_

SESSION_DRIVER=redis
SESSION_LIFETIME=10080
SESSION_COOKIE=koyun_drive_session
SESSION_SECURE_COOKIE=$([ "$SCHEME" = https ] && echo true || echo false)
CACHE_STORE=redis
CACHE_PREFIX=koyun_drive_cache_
QUEUE_CONNECTION=sync

OCTANE_SERVER=swoole
OCTANE_WORKERS=${OCTANE_WORKERS:-4}
OCTANE_HTTPS=$([ "$SCHEME" = https ] && echo true || echo false)

DRIVE_FILES_PATH=/app/storage/drive/files
DRIVE_TMP_PATH=/app/storage/drive/tmp
DRIVE_UPLOAD_URL=${UPLOAD_URL}
DRIVE_CORS_ORIGINS=${CORS}

IMAGE_TAG=${IMAGE_TAG:-latest}
WEB_BIND=${WEB_BIND}
EOF
umask 022

PROFILE=""
if [ "$MODE" = caddy ]; then
  PROFILE="--profile caddy"
  {
    echo "${DOMAIN} {"
    echo "	encode gzip zstd"
    echo "	reverse_proxy web:80"
    echo "}"
    if [ -n "${UPLOAD_DOMAIN:-}" ]; then
      echo "${UPLOAD_DOMAIN} {"
      echo "	reverse_proxy web:80"
      echo "}"
    fi
  } > Caddyfile
fi

mkdir -p data/storage/files data/storage/tmp data/logs
chown -R 33:33 data/storage data/logs   # www-data inside the app image

# ---------------------------------------------------------------- start
info "拉取镜像并启动（首次需要几分钟）..."
docker compose $PROFILE pull
docker compose $PROFILE up -d

info "等待服务就绪 ..."
for _ in $(seq 1 90); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' drive-app 2>/dev/null)" = healthy ] && break
  sleep 2
done
[ "$(docker inspect -f '{{.State.Health.Status}}' drive-app 2>/dev/null)" = healthy ] || die "应用未能启动，请查看日志：cd $DIR && docker compose logs app"

ADMIN_PASS="$(docker compose exec -T app php artisan drive:admin "$ADMIN_USER" | sed -n 's/^password: //p')"
printf 'username: %s\npassword: %s\n' "$ADMIN_USER" "$ADMIN_PASS" > admin-credentials.txt
chmod 600 admin-credentials.txt

echo
c '1;32' "================ 安装完成 ================"
echo "  网站地址:   ${APP_URL}"
echo "  管理后台:   ${APP_URL}/admin/"
echo "  管理员:     ${ADMIN_USER}"
echo "  密码:       ${ADMIN_PASS}    （已保存到 $DIR/admin-credentials.txt，登录后请修改）"
[ -n "$UPLOAD_URL" ] && echo "  上传域名:   ${UPLOAD_URL}  （DNS 需直接解析到本机，不要走 CDN）"
if [ "$MODE" = proxy ]; then
  echo
  echo "  请在你的反向代理中把 ${DOMAIN}${UPLOAD_DOMAIN:+ 和 $UPLOAD_DOMAIN} 转发到 http://${WEB_BIND}，并传递"
  echo "  X-Forwarded-For / X-Forwarded-Proto 头。nginx 还需 client_max_body_size 40m;"
fi
echo
echo "  常用命令（在 $DIR 下执行）："
echo "    docker compose ps | logs -f app | restart"
echo "    docker compose exec app php artisan drive:admin ${ADMIN_USER}    # 重置管理员密码"
echo "    bash <(curl -fsSL $RAW/install.sh)                         # 升级到最新版本"
