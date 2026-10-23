<?php

namespace App\Providers;

use App\Services\DriveSettings;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\ValidateSignature;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Holds no request state (values come from the cache), so it is Octane-safe.
        $this->app->singleton(DriveSettings::class);
    }

    public function boot(): void
    {
        // "?preview=1" switches a signed download link to inline display.
        ValidateSignature::except(['preview']);

        $tooMany = fn () => response()->json(['error' => '请求过于频繁，请稍后再试'], 429);
        RateLimiter::for('public', fn (Request $r) => Limit::perMinute(120)->by($r->ip())->response($tooMany));
        RateLimiter::for('user', fn (Request $r) => Limit::perMinute(600)->by('u:'.($r->session()->get('uid') ?: $r->ip()))->response($tooMany));
        RateLimiter::for('chunks', fn (Request $r) => Limit::perMinute(1200)->by('c:'.$r->ip())->response($tooMany));
        RateLimiter::for('downloads', fn (Request $r) => Limit::perMinute(240)->by('d:'.$r->ip()));
    }
}
