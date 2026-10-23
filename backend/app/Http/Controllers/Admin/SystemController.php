<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Upload;
use App\Services\HotCache;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

class SystemController extends Controller
{
    public function status(): JsonResponse
    {
        $check = function (callable $fn) {
            $t = microtime(true);
            try {
                $v = $fn();

                return ['ok' => true, 'ms' => round((microtime(true) - $t) * 1000, 1), 'version' => $v];
            } catch (Throwable $e) {
                return ['ok' => false, 'error' => mb_substr($e->getMessage(), 0, 200)];
            }
        };
        $files = config('drive.files_path');
        $tmp = config('drive.tmp_path');

        return response()->json([
            'services' => [
                'mysql' => $check(fn () => DB::selectOne('SELECT VERSION() v')->v),
                'redis' => $check(fn () => Redis::connection()->info('server')['redis_version'] ?? (Redis::connection()->info()['Server']['redis_version'] ?? '?')),
                'octane_cache' => $check(function () {
                    HotCache::store()->put('__ping', 1, 10);

                    return HotCache::store()->get('__ping') === 1 ? get_class(HotCache::store()->getStore()) : throw new \RuntimeException('read back failed');
                }),
            ],
            'versions' => [
                'php' => PHP_VERSION,
                'laravel' => app()->version(),
                'swoole' => phpversion('swoole') ?: null,
                'octane' => \Composer\InstalledVersions::getPrettyVersion('laravel/octane'),
            ],
            'storage' => [
                'path' => $files,
                'disk_total' => (int) @disk_total_space($files),
                'disk_free' => (int) @disk_free_space($files),
                'tmp_bytes' => (int) Upload::where('status', '!=', 'done')->get()->sum(fn ($u) => is_file($u->tmpPath()) ? filesize($u->tmpPath()) : 0),
                'tmp_path' => $tmp,
            ],
            'php' => ['memory_usage' => memory_get_usage(true), 'memory_limit' => ini_get('memory_limit')],
            'server_time' => now()->toIso8601String(),
        ]);
    }
}
