<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DriveFile;
use App\Models\Folder;
use App\Models\Share;
use App\Models\Upload;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $page = User::query()
            ->when($q !== '', fn ($w) => $w->where('username', 'like', '%'.addcslashes($q, '%_\\').'%'))
            ->orderByDesc('is_admin')->orderBy('id')
            ->paginate(min(100, max(10, $request->integer('per_page', 20))));
        $usage = DriveFile::whereIn('owner_id', $page->pluck('id'))->selectRaw('owner_id, COUNT(*) n, COALESCE(SUM(size),0) bytes')
            ->groupBy('owner_id')->get()->keyBy('owner_id');

        return response()->json([
            'data' => collect($page->items())->map(fn (User $u) => $this->row($u, $usage[$u->id] ?? null)),
            'total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'regex:/^[A-Za-z0-9_.\-@]{2,64}$/', 'unique:users,username'],
            'password' => ['required', 'string', 'min:8', 'max:200'],
            'is_admin' => ['boolean'],
            'quota_gb' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
        ], ['username.regex' => '用户名只能包含字母、数字和 _ . - @', 'username.unique' => '用户名已存在'], ['username' => '用户名', 'password' => '密码']);

        $user = User::create([
            'username' => $data['username'],
            'password' => $data['password'],
            'is_admin' => $data['is_admin'] ?? false,
            'quota_bytes' => isset($data['quota_gb']) ? (int) ($data['quota_gb'] * 1024 ** 3) : null,
        ]);

        return response()->json(['user' => $this->row($user, null)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $me = $this->user($request);
        $data = $request->validate([
            'username' => ['sometimes', 'string', 'regex:/^[A-Za-z0-9_.\-@]{2,64}$/', Rule::unique('users', 'username')->ignore($user->id)],
            'is_admin' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'quota_gb' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1000000'],
        ], ['username.unique' => '用户名已存在'], ['username' => '用户名']);

        if ($user->id === $me->id && ((isset($data['is_admin']) && ! $data['is_admin']) || (isset($data['is_active']) && ! $data['is_active']))) {
            abort(422, '不能停用自己或取消自己的管理员权限');
        }
        if (array_key_exists('quota_gb', $data)) {
            $user->quota_bytes = $data['quota_gb'] === null ? null : (int) ($data['quota_gb'] * 1024 ** 3);
        }
        $user->fill(collect($data)->only(['username', 'is_admin', 'is_active'])->all())->save();

        return response()->json(['user' => $this->row($user, null)]);
    }

    public function password(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $data = $request->validate(['password' => ['required', 'string', 'min:8', 'max:200']], [], ['password' => '密码']);
        $user->update(['password' => $data['password']]); // also ends that user's sessions

        return response()->json(['ok' => true]);
    }

    /** Deletes a user; their files go to the acting administrator unless purge=true. */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);
        $me = $this->user($request);
        if ($user->id === $me->id) {
            abort(422, '不能删除自己');
        }
        $purge = $request->boolean('purge');
        foreach (Upload::where('user_id', $user->id)->get() as $upload) {
            \App\Http\Controllers\UploadController::discard($upload);
        }
        if ($purge) {
            \App\Http\Controllers\DriveController::removeFiles(DriveFile::where('owner_id', $user->id)->get());
            // children first
            $folders = Folder::where('owner_id', $user->id)->get();
            while ($folders->isNotEmpty()) {
                $parents = $folders->pluck('parent_id')->filter()->all();
                $leaves = $folders->reject(fn ($f) => in_array($f->id, $parents, true));
                foreach ($leaves as $leaf) {
                    $leaf->delete();
                }
                $folders = $folders->diff($leaves);
            }
        } else {
            DriveFile::where('owner_id', $user->id)->update(['owner_id' => $me->id]);
            Folder::where('owner_id', $user->id)->update(['owner_id' => $me->id]);
        }
        Share::where('user_id', $user->id)->update(['user_id' => $me->id]);
        $user->delete();

        return response()->json(['ok' => true]);
    }

    private function row(User $u, $usage): array
    {
        return [
            'id' => $u->id, 'username' => $u->username, 'is_admin' => $u->is_admin, 'is_active' => $u->is_active,
            'quota_bytes' => $u->quota_bytes, 'effective_quota' => $u->quota(),
            'files' => (int) ($usage->n ?? 0), 'used' => (int) ($usage->bytes ?? 0),
            'last_login_at' => $u->last_login_at?->toIso8601String(), 'last_login_ip' => $u->last_login_ip,
            'created_at' => $u->created_at?->toIso8601String(),
        ];
    }
}
