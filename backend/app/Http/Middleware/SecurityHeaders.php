<?php

namespace App\Http\Middleware;

use App\Services\DriveSettings;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function __construct(private readonly DriveSettings $settings) {}

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $h = $response->headers;
        $h->set('X-Content-Type-Options', 'nosniff');
        $h->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $h->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        if (str_contains((string) $h->get('Content-Type'), 'text/html')) {
            $upload = $this->uploadOrigin();
            $h->set('X-Frame-Options', 'DENY');
            $h->set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                ."img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'$upload; "
                ."object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
        }
        if ($request->is('kd/*')) {
            $h->set('Cache-Control', 'no-store, private');
        }

        return $response;
    }

    private function uploadOrigin(): string
    {
        $parts = parse_url((string) $this->settings->get('upload_url'));

        return isset($parts['scheme'], $parts['host'])
            ? ' '.$parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '')
            : '';
    }
}
