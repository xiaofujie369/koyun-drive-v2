<?php

namespace App\Http\Controllers;

use App\Models\DriveFile;
use App\Models\Folder;
use App\Models\Share;
use App\Services\Downloader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class ShareController extends Controller
{
    // ------------------------------------------------------------ owner side

    public function index(Request $request): JsonResponse
    {
        $shares = Share::with(['file:id,name', 'folder:id,name', 'user:id,username'])
            ->where('user_id', $this->user($request)->id)->latest()->limit(500)->get();

        return response()->json(['shares' => $shares->map(fn ($s) => $s->toOwnerArray())]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'file_id' => ['nullable', 'required_without:folder_id', 'integer', 'exists:files,id'],
            'folder_id' => ['nullable', 'required_without:file_id', 'integer', 'exists:folders,id'],
            'password' => ['nullable', 'string', 'max:32', 'regex:/^[A-Za-z0-9]*$/'],
            'expires_days' => ['nullable', 'integer', 'min:0', 'max:3650'],
            'max_downloads' => ['nullable', 'integer', 'min:0', 'max:1000000'],
        ], ['password.regex' => '提取码只能包含字母和数字'], ['password' => '提取码']);

        $target = ! empty($data['file_id']) ? DriveFile::findOrFail($data['file_id']) : Folder::findOrFail($data['folder_id']);
        $this->authorizeOwner($request, $target->owner_id);

        $share = Share::create([
            'token' => Str::random(12),
            'user_id' => $this->user($request)->id,
            'file_id' => $target instanceof DriveFile ? $target->id : null,
            'folder_id' => $target instanceof Folder ? $target->id : null,
            'password' => ($data['password'] ?? '') !== '' ? $data['password'] : null,
            'expires_at' => ! empty($data['expires_days']) ? now()->addDays($data['expires_days']) : null,
            'max_downloads' => ! empty($data['max_downloads']) ? $data['max_downloads'] : null,
        ]);

        return response()->json(['share' => $share->load(['file', 'folder', 'user'])->toOwnerArray()], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $share = Share::findOrFail($id);
        $this->authorizeOwner($request, $share->user_id);
        $share->delete();

        return response()->json(['ok' => true]);
    }

    // ------------------------------------------------------------ visitor side

    public function show(Request $request, string $token): JsonResponse
    {
        $share = $this->usableShare($token);
        $info = [
            'token' => $share->token,
            'type' => $share->file_id ? 'file' : 'folder',
            'name' => $share->file?->name ?? $share->folder?->name,
            'owner' => $share->user?->username,
            'created_at' => $share->created_at?->toIso8601String(),
            'expires_at' => $share->expires_at?->toIso8601String(),
            'locked' => $share->password !== null && ! $this->unlocked($request, $share),
        ];
        if ($info['locked']) {
            return response()->json($info);
        }
        if (! $request->session()->get("share_viewed.{$share->id}")) {
            $request->session()->put("share_viewed.{$share->id}", true);
            $share->increment('view_count');
        }
        if ($share->file_id) {
            $info['file'] = $this->fileEntry($share, $share->file);
        }

        return response()->json($info);
    }

    public function unlock(Request $request, string $token): JsonResponse
    {
        $share = $this->usableShare($token);
        $key = 'share-unlock:'.sha1($request->ip().'|'.$token);
        if (RateLimiter::tooManyAttempts($key, 10)) {
            abort(429, '尝试次数过多，请稍后再试');
        }
        $given = (string) $request->input('password', '');
        if ($share->password === null || ! hash_equals(strtolower($share->password), strtolower(trim($given)))) {
            RateLimiter::hit($key, 600);
            abort(422, '提取码错误');
        }
        RateLimiter::clear($key);
        $request->session()->put("share_unlocked.{$share->id}", true);

        return response()->json(['ok' => true]);
    }

    /** Browse inside a shared folder. */
    public function browse(Request $request, string $token): JsonResponse
    {
        $share = $this->usableShare($token);
        if (! $share->folder_id) {
            abort(404, '该分享不是文件夹');
        }
        if ($share->password !== null && ! $this->unlocked($request, $share)) {
            abort(403, '请输入提取码');
        }
        $folderId = $request->integer('folder_id') ?: $share->folder_id;
        $allowed = $share->folder->descendantIds();
        if (! in_array($folderId, $allowed, true)) {
            abort(404, '文件夹不在该分享范围内');
        }
        $folder = Folder::findOrFail($folderId);
        $crumbs = [];
        foreach ($folder->breadcrumbs() as $c) {
            if ($c['id'] === $share->folder_id || $crumbs) {
                $crumbs[] = ['id' => $c['id'], 'name' => $c['name']];
            }
        }

        return response()->json([
            'breadcrumbs' => $crumbs,
            'folders' => Folder::where('parent_id', $folderId)->orderByDesc('sort_order')->orderBy('name')->get(['id', 'name']),
            'files' => DriveFile::where('folder_id', $folderId)->orderBy('name')->get()->map(fn ($f) => $this->fileEntry($share, $f)),
        ]);
    }

    public function download(Request $request, string $token, int $fileId): Response
    {
        $share = Share::with(['file', 'folder'])->where('token', $token)->first();
        if (! $share || ($reason = $share->unavailableReason())) {
            abort(410, $reason ?? '分享不存在或已被取消');
        }
        $file = DriveFile::find($fileId);
        $inShare = $file && ($share->file_id === $file->id
            || ($share->folder_id && $file->folder_id && in_array($file->folder_id, $share->folder->descendantIds(), true)));
        if (! $inShare) {
            abort(404, '文件不存在或已被删除');
        }

        return Downloader::send($request, $file, 'share', $share);
    }

    /** Old /s/{token}/download links: send visitors to the share page. */
    public function legacyDownload(string $token): RedirectResponse
    {
        return redirect('/s/'.rawurlencode($token));
    }

    // ------------------------------------------------------------ helpers

    private function usableShare(string $token): Share
    {
        $share = Share::with(['file', 'folder', 'user:id,username'])->where('token', $token)->first();
        if (! $share) {
            abort(404, '分享不存在或已被取消');
        }
        if ($reason = $share->unavailableReason()) {
            abort(410, $reason);
        }

        return $share;
    }

    private function unlocked(Request $request, Share $share): bool
    {
        return (bool) $request->session()->get("share_unlocked.{$share->id}");
    }

    private function fileEntry(Share $share, DriveFile $f): array
    {
        $url = URL::temporarySignedRoute('share.download', now()->addHours(12),
            ['token' => $share->token, 'fileId' => $f->id, 'name' => $f->name], absolute: false);

        return [
            'id' => $f->id, 'name' => $f->name, 'size' => $f->size, 'mime_type' => $f->mime_type, 'note' => $f->note,
            'created_at' => $f->created_at?->toIso8601String(), 'url' => $url,
            'preview_url' => Downloader::canPreview($f) ? $url.'&preview=1' : null,
        ];
    }
}
