# ---- User frontend (Vue 3 + TypeScript + Naive UI) -> /
FROM node:20.18-alpine AS frontend
WORKDIR /build
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# ---- Admin panel (React + shadcn/ui + Tailwind) -> /admin/
FROM node:20.18-alpine AS admin
WORKDIR /build
COPY admin/package.json ./
RUN npm install --no-audit --no-fund
COPY admin/ .
RUN npm run build

# ---- PHP dependencies
FROM composer:2.8 AS vendor
WORKDIR /app
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-interaction --no-scripts --no-autoloader --ignore-platform-reqs
COPY backend/ .
RUN composer dump-autoload --optimize --no-dev --no-scripts

# ---- Web: nginx serves the SPAs and the file bytes (X-Accel-Redirect)
FROM nginx:1.27-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend /build/dist /srv/www
COPY --from=admin /build/dist /srv/www/admin

# ---- App: Laravel 11 + Octane (Swoole) on PHP 8.3
FROM php:8.3-cli-bookworm AS app
COPY --from=mlocati/php-extension-installer:2.7 /usr/bin/install-php-extensions /usr/local/bin/
# Same layer as the mail portal image so the Swoole build is reused from cache.
RUN install-php-extensions swoole-5.1.6 pdo_mysql redis pcntl opcache \
 && printf "opcache.enable_cli=1\nopcache.memory_consumption=96\nopcache.validate_timestamps=0\nmemory_limit=256M\nexpose_php=0\n" > /usr/local/etc/php/conf.d/zz-portal.ini
RUN rm /usr/local/etc/php/conf.d/zz-portal.ini \
 && printf "opcache.enable_cli=1\nopcache.memory_consumption=96\nopcache.validate_timestamps=0\nmemory_limit=512M\nexpose_php=0\npost_max_size=40M\nupload_max_filesize=40M\n" > /usr/local/etc/php/conf.d/zz-drive.ini
WORKDIR /app
COPY --from=vendor /app /app
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint \
 && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs storage/drive \
 && rm -f bootstrap/cache/*.php && php artisan package:discover --ansi \
 && chown -R www-data:www-data storage bootstrap/cache
USER www-data
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD php -r 'exit(@file_get_contents("http://127.0.0.1:9000/up") === false ? 1 : 0);'
ENTRYPOINT ["entrypoint"]
