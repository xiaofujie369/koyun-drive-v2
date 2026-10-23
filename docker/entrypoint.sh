#!/bin/sh
set -e
cd /app
mkdir -p storage/drive/files storage/drive/tmp storage/framework/cache storage/framework/sessions storage/framework/views storage/logs
php artisan config:cache
php artisan route:cache

if [ "${CONTAINER_ROLE:-app}" = "scheduler" ]; then
  # drive:cleanup hourly (abandoned uploads, orphan temp files, old logs)
  exec php artisan schedule:work
fi

php artisan migrate --force --no-interaction
exec php artisan octane:start --server=swoole --host=0.0.0.0 --port=9000 \
  --workers="${OCTANE_WORKERS:-4}" --task-workers=0 --max-requests=2000
