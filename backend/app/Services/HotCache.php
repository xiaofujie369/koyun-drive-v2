<?php

namespace App\Services;

use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Small, hot values (settings, public folder visibility) live in the Octane
 * cache — a Swoole table shared by all workers — and fall back to Redis when
 * running outside Octane (artisan commands, scheduler). Keep values tiny:
 * a Swoole table row holds at most octane.cache.bytes.
 */
class HotCache
{
    private static ?bool $octane = null;

    public static function store(): Repository
    {
        if (self::$octane === null) {
            try {
                Cache::store('octane')->get('__probe');
                self::$octane = true;
            } catch (Throwable) {
                self::$octane = false;
            }
        }

        return self::$octane ? Cache::store('octane') : Cache::store();
    }

    public static function remember(string $key, int $ttl, callable $callback): mixed
    {
        return self::store()->remember($key, $ttl, $callback);
    }

    public static function forget(string ...$keys): void
    {
        foreach ($keys as $key) {
            self::store()->forget($key);
            Cache::store()->forget($key);
        }
    }
}
