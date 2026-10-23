<?php

namespace App\Http\Middleware;

use App\Services\Audit;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Records every state-changing request made by an administrator. */
class AuditWrites
{
    private const SECRET_FIELDS = ['password', 'current_password', 'new_password', 'access_password'];

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $user = $request->attributes->get('user');
        if ($user?->is_admin && ! $request->isMethodSafe() && $request->route()?->getName()) {
            $details = collect($request->except(self::SECRET_FIELDS))
                ->map(fn ($v) => is_string($v) ? mb_substr($v, 0, 200) : $v)->all();
            $target = collect($request->route()->parameters())->map(fn ($v, $k) => "$k=$v")->implode(' ');
            Audit::log($request, $request->route()->getName(), $target ?: null, $details, $response->getStatusCode() < 400);
        }

        return $response;
    }
}
