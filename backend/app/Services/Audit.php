<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Http\Request;

class Audit
{
    public static function log(Request $request, string $action, ?string $target = null, array $details = [], bool $success = true): void
    {
        $user = $request->attributes->get('user');
        AuditLog::create([
            'user_id' => $user?->id,
            'username' => $user?->username ?? '',
            'action' => $action,
            'target' => $target ? mb_substr($target, 0, 191) : null,
            'details' => $details ?: null,
            'success' => $success,
            'ip' => (string) $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);
    }
}
