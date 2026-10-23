<?php

namespace App\Http\Controllers;

use App\Http\Middleware\Authenticate;
use App\Models\LoginLog;
use App\Models\User;
use App\Services\Audit;
use App\Services\DriveSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

class AuthController extends Controller
{
    private const MAX_FAILURES = 8;

    public function me(Request $request): JsonResponse
    {
        $user = Authenticate::resolve($request);

        return response()->json(['user' => $user ? $this->profile($user) : null]);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:64'],
            'password' => ['required', 'string', 'max:200'],
        ], [], ['username' => '用户名', 'password' => '密码']);
        $username = trim($data['username']);
        $ip = (string) $request->ip();
        $key = 'login:'.sha1($ip);

        if (RateLimiter::tooManyAttempts($key, self::MAX_FAILURES)) {
            $this->logLogin($request, $username, 'locked');
            abort(429, '登录失败次数过多，请 '.ceil(RateLimiter::availableIn($key) / 60).' 分钟后再试');
        }

        $user = User::where('username', $username)->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($key, 900);
            $this->logLogin($request, $username, 'bad_credentials');
            abort(422, '用户名或密码错误');
        }
        if (! $user->is_active) {
            $this->logLogin($request, $username, 'disabled');
            abort(403, '该账号已被停用');
        }

        RateLimiter::clear($key);
        $this->startSession($request, $user);
        $user->forceFill(['last_login_at' => now(), 'last_login_ip' => $ip])->save();
        $this->logLogin($request, $username, 'success');

        return response()->json(['user' => $this->profile($user)]);
    }

    public function register(Request $request, DriveSettings $settings): JsonResponse
    {
        if (! $settings->get('allow_register')) {
            abort(403, '当前未开放注册');
        }
        $key = 'register:'.sha1((string) $request->ip());
        if (RateLimiter::tooManyAttempts($key, 3)) {
            abort(429, '注册过于频繁，请稍后再试');
        }
        $data = $request->validate([
            'username' => ['required', 'string', 'regex:/^[A-Za-z0-9_.\-]{3,32}$/', 'unique:users,username'],
            'password' => ['required', 'string', 'min:8', 'max:200'],
        ], ['username.regex' => '用户名只能包含字母、数字、下划线、点和横线，长度 3-32', 'username.unique' => '用户名已被占用'],
            ['username' => '用户名', 'password' => '密码']);

        RateLimiter::hit($key, 3600);
        $user = User::create(['username' => $data['username'], 'password' => $data['password']]);
        $this->startSession($request, $user);

        return response()->json(['user' => $this->profile($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:8', 'max:200', 'different:current_password'],
        ], [], ['current_password' => '当前密码', 'new_password' => '新密码']);
        if (! Hash::check($data['current_password'], $user->password)) {
            abort(422, '当前密码不正确');
        }
        $user->update(['password' => $data['new_password']]);
        $this->startSession($request, $user->fresh());
        Audit::log($request, 'account.password', $user->username);

        return response()->json(['ok' => true]);
    }

    private function startSession(Request $request, User $user): void
    {
        $request->session()->regenerate();
        $request->session()->put(['uid' => $user->id, 'pwd' => substr($user->password, -16)]);
        $request->attributes->set('user', $user);
    }

    private function profile(User $user): array
    {
        return $user->toPublic() + ['quota' => $user->quota(), 'used' => $user->usedBytes()];
    }

    private function logLogin(Request $request, string $username, string $result): void
    {
        LoginLog::create([
            'username' => mb_substr($username, 0, 64),
            'result' => $result,
            'ip' => (string) $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);
    }
}
