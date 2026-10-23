<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = Authenticate::resolve($request);
        if (! $user) {
            abort(401, '请先登录');
        }
        if (! $user->is_admin) {
            abort(403, '需要管理员权限');
        }

        return $next($request);
    }
}
