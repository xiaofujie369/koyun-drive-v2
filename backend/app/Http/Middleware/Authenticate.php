<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class Authenticate
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = self::resolve($request);
        if (! $user) {
            abort(401, '请先登录');
        }

        return $next($request);
    }

    /** Loads the session user (if any) onto the request; drops stale sessions. */
    public static function resolve(Request $request): ?User
    {
        if ($request->attributes->has('user')) {
            return $request->attributes->get('user');
        }
        $session = $request->session();
        $uid = $session->get('uid');
        $user = $uid ? User::find($uid) : null;
        if ($uid && (! $user || ! $user->is_active || $session->get('pwd') !== substr($user->password, -16))) {
            // Disabled, deleted, or password changed elsewhere: end this session.
            $session->forget(['uid', 'pwd']);
            $user = null;
        }
        $request->attributes->set('user', $user);

        return $user;
    }
}
