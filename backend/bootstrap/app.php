<?php

use App\Http\Middleware\AuditWrites;
use App\Http\Middleware\Authenticate;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Routing\Exceptions\InvalidSignatureException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // The app is reachable only through the nginx container, which forwards
        // the client address Caddy determined (CF-Connecting-IP / remote addr).
        $middleware->trustProxies(at: '*',
            headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO | Request::HEADER_X_FORWARDED_HOST);
        $middleware->append(SecurityHeaders::class);
        $middleware->alias(['auth.drive' => Authenticate::class, 'admin' => EnsureAdmin::class, 'audit' => AuditWrites::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $api = fn (Request $r) => $r->is('kd/*');
        $exceptions->render(fn (InvalidSignatureException $e) => response('下载链接已失效，请返回页面重新获取下载链接', 403,
            ['Content-Type' => 'text/plain; charset=utf-8']));
        $exceptions->render(fn (TokenMismatchException $e, Request $r) => $api($r)
            ? response()->json(['error' => '页面已过期，请刷新后重试', 'code' => 'csrf'], 419) : null);
        $exceptions->render(fn (ValidationException $e, Request $r) => $api($r)
            ? response()->json(['error' => collect($e->errors())->flatten()->first(), 'errors' => $e->errors()], 422) : null);
        $exceptions->render(fn (HttpExceptionInterface $e, Request $r) => $api($r)
            ? response()->json(['error' => $e->getMessage() ?: '请求失败'], $e->getStatusCode(), $e->getHeaders()) : null);
        $exceptions->render(fn (Throwable $e, Request $r) => $api($r) && ! config('app.debug')
            ? response()->json(['error' => '服务器内部错误'], 500) : null);
        // Non-API pages (download links) get a short plain-text message.
        $exceptions->render(fn (HttpExceptionInterface $e, Request $r) => ! $api($r)
            ? response($e->getMessage() ?: ($e->getStatusCode() === 404 ? '页面不存在' : '请求失败'), $e->getStatusCode(),
                ['Content-Type' => 'text/plain; charset=utf-8'] + $e->getHeaders()) : null);
    })->create();
