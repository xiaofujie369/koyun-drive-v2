<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

abstract class Controller
{
    protected function user(Request $request): User
    {
        return $request->attributes->get('user');
    }

    /** Owners manage their own items; administrators manage everything. */
    protected function authorizeOwner(Request $request, int $ownerId): void
    {
        $user = $this->user($request);
        if (! $user->is_admin && $user->id !== $ownerId) {
            abort(403, '没有权限操作该项目');
        }
    }
}
