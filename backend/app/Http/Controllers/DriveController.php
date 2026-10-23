<?php

namespace App\Http\Controllers;

use App\Models\DriveFile;
use App\Models\Folder;
use App\Models\User;
use App\Services\Downloader;
use App\Services\DriveSettings;
use App\Services\PublicTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

/**
 * Personal file management. Owners act on their own items; administrators may
 * act on anything (the admin panel uses these same endpoints).
 */
class DriveController extends Controller
{
    public function __construct(private readonly DriveSettings $settings) {}

    /** Contents of one folder, or of an owner's root when folder_id is empty. */
    public function list(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $folderId = $request->integer('folder_id') ?: null;
        $folder = null;
        if ($folderId) {
            $folder = Folder::findOrFail($folderId);
            $this->authorizeOwner($request, $folder->owner_id);
            $ownerId = $folder->owner_id;
        } else {
            $ownerId = $user->is_admin && $request->filled('owner_id') ? $request->integer('owner_id') : $user->id;
        }

        $folders = Folder::where('owner_id', $ownerId)->where('parent_id', $folderId)
            ->orderByDesc('sort_order')->orderBy('name')->get();
        $counts = DriveFile::whereIn('folder_id', $folders->pluck('id'))->selectRaw('folder_id, COUNT(*) n, COALESCE(SUM(size),0) bytes')
            ->groupBy('folder_id')->get()->keyBy('folder_id');
        $files = DriveFile::where('owner_id', $ownerId)->where('folder_id', $folderId)->orderByDesc('sort_order')->orderBy('name')->get();

        return response()->json([
            'owner' => User::find($ownerId)?->only(['id', 'username']),
            'folder' => $folder ? $this->folderArray($folder) : null,
            'breadcrumbs' => $folder ? $folder->breadcrumbs() : [],
            'folders' => $folders->map(fn ($f) => $this->folderArray($f) + [
                'files' => (int) ($counts[$f->id]->n ?? 0), 'size' => (int) ($counts[$f->id]->bytes ?? 0),
            ]),
            'files' => $files->map(fn ($f) => $this->fileArray($f)),
        ]);
    }

    /** Flat folder list for pickers. Admins may request every owner's folders. */
    public function tree(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $query = Folder::query()->with('owner:id,username')->orderByDesc('sort_order')->orderBy('name');
        if (! ($user->is_admin && $request->boolean('all'))) {
            $query->where('owner_id', $request->filled('owner_id') && $user->is_admin ? $request->integer('owner_id') : $user->id);
        }

        return response()->json(['folders' => $query->get()->map(fn ($f) => [
            'id' => $f->id, 'name' => $f->name, 'parent_id' => $f->parent_id, 'is_public' => $f->is_public,
            'owner_id' => $f->owner_id, 'owner' => $f->owner?->username,
        ])]);
    }

    public function usage(Request $request): JsonResponse
    {
        $user = $this->user($request);

        return response()->json([
            'used' => $user->usedBytes(), 'quota' => $user->quota(),
            'files' => DriveFile::where('owner_id', $user->id)->count(),
            'folders' => Folder::where('owner_id', $user->id)->count(),
        ]);
    }

    public function createFolder(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'not_regex:/[\\\\\/]/'],
            'parent_id' => ['nullable', 'integer', 'exists:folders,id'],
            'is_public' => ['sometimes', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'owner_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
        ], ['name.not_regex' => '文件夹名不能包含斜杠'], ['name' => '文件夹名称']);

        $ownerId = $user->id;
        if (! empty($data['parent_id'])) {
            $parent = Folder::findOrFail($data['parent_id']);
            $this->authorizeOwner($request, $parent->owner_id);
            $ownerId = $parent->owner_id;
        } elseif ($user->is_admin && ! empty($data['owner_id'])) {
            $ownerId = (int) $data['owner_id'];
        }
        $name = trim($data['name']);
        $this->assertFolderNameFree($ownerId, $data['parent_id'] ?? null, $name);

        $folder = Folder::create([
            'owner_id' => $ownerId,
            'parent_id' => $data['parent_id'] ?? null,
            'name' => $name,
            'description' => (string) ($data['description'] ?? ''),
            'is_public' => $this->canPublish($request) && ($data['is_public'] ?? false),
        ]);

        return response()->json(['folder' => $this->folderArray($folder)], 201);
    }

    public function updateFolder(Request $request, int $id): JsonResponse
    {
        $folder = Folder::findOrFail($id);
        $this->authorizeOwner($request, $folder->owner_id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120', 'not_regex:/[\\\\\/]/'],
            'parent_id' => ['sometimes', 'nullable', 'integer', 'exists:folders,id'],
            'is_public' => ['sometimes', 'boolean'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'sort_order' => ['sometimes', 'integer', 'between:-100000,100000'],
        ], ['name.not_regex' => '文件夹名不能包含斜杠'], ['name' => '文件夹名称']);

        if (array_key_exists('parent_id', $data)) {
            $this->moveFolderTo($request, $folder, $data['parent_id']);
        }
        if (isset($data['name']) && trim($data['name']) !== $folder->name) {
            $this->assertFolderNameFree($folder->owner_id, $folder->parent_id, trim($data['name']), $folder->id);
            $folder->name = trim($data['name']);
        }
        if (array_key_exists('description', $data)) {
            $folder->description = (string) $data['description'];
        }
        if (isset($data['sort_order'])) {
            $folder->sort_order = $data['sort_order'];
        }
        if (array_key_exists('is_public', $data)) {
            if (! $this->canPublish($request)) {
                abort(403, '管理员未允许普通用户公开文件夹');
            }
            $folder->is_public = $data['is_public'];
        }
        $folder->save();

        return response()->json(['folder' => $this->folderArray($folder)]);
    }

    public function deleteFolder(Request $request, int $id): JsonResponse
    {
        $folder = Folder::findOrFail($id);
        $this->authorizeOwner($request, $folder->owner_id);
        $result = $this->deleteFolders([$folder]);

        return response()->json($result);
    }

    public function updateFile(Request $request, int $id): JsonResponse
    {
        $file = DriveFile::findOrFail($id);
        $this->authorizeOwner($request, $file->owner_id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:180', 'not_regex:/[\\\\\/]/'],
            'folder_id' => ['sometimes', 'nullable', 'integer', 'exists:folders,id'],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ], ['name.not_regex' => '文件名不能包含斜杠'], ['name' => '文件名']);

        if (array_key_exists('folder_id', $data)) {
            $this->assertFolderTarget($request, $file->owner_id, $data['folder_id']);
            $file->folder_id = $data['folder_id'];
        }
        if (isset($data['name'])) {
            $file->name = trim($data['name']) ?: $file->name;
        }
        if (array_key_exists('note', $data)) {
            $file->note = (string) $data['note'];
        }
        $file->save();

        return response()->json(['file' => $this->fileArray($file)]);
    }

    public function deleteFile(Request $request, int $id): JsonResponse
    {
        $file = DriveFile::findOrFail($id);
        $this->authorizeOwner($request, $file->owner_id);
        self::removeFiles(collect([$file]));

        return response()->json(['deleted' => 1]);
    }

    /** Bulk move/delete of files and folders. */
    public function batch(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', Rule::in(['move', 'delete'])],
            'file_ids' => ['array', 'max:1000'],
            'file_ids.*' => ['integer'],
            'folder_ids' => ['array', 'max:500'],
            'folder_ids.*' => ['integer'],
            'target_id' => ['nullable', 'integer', 'exists:folders,id'],
        ]);
        $files = DriveFile::whereIn('id', $data['file_ids'] ?? [])->get();
        $folders = Folder::whereIn('id', $data['folder_ids'] ?? [])->get();
        foreach ([...$files, ...$folders] as $item) {
            $this->authorizeOwner($request, $item->owner_id);
        }

        if ($data['action'] === 'delete') {
            $result = $this->deleteFolders($folders->all());
            self::removeFiles($files);

            return response()->json(['files' => $result['files'] + $files->count(), 'folders' => $result['folders']]);
        }

        $target = $data['target_id'] ?? null;
        DB::transaction(function () use ($request, $files, $folders, $target) {
            foreach ($folders as $folder) {
                $this->moveFolderTo($request, $folder, $target);
                $folder->save();
            }
            foreach ($files as $file) {
                $this->assertFolderTarget($request, $file->owner_id, $target);
                $file->update(['folder_id' => $target]);
            }
        });

        return response()->json(['files' => $files->count(), 'folders' => $folders->count()]);
    }

    /**
     * Saves a manual order for the items of one folder (or an owner's root).
     * IDs come in display order; the first gets the highest sort_order.
     */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'folder_ids' => ['array', 'max:2000'],
            'folder_ids.*' => ['integer', 'distinct'],
            'file_ids' => ['array', 'max:5000'],
            'file_ids.*' => ['integer', 'distinct'],
        ]);
        $folderIds = $data['folder_ids'] ?? [];
        $fileIds = $data['file_ids'] ?? [];
        $folders = Folder::whereIn('id', $folderIds)->get(['id', 'owner_id', 'parent_id']);
        $files = DriveFile::whereIn('id', $fileIds)->get(['id', 'owner_id', 'folder_id']);
        if ($folders->count() !== count($folderIds) || $files->count() !== count($fileIds)) {
            abort(404, '部分项目不存在，请刷新后重试');
        }
        // Everything must sit in the same place, otherwise the order is meaningless.
        // toBase(): an empty Eloquent collection would try to merge these strings as models.
        $places = $folders->toBase()->map(fn ($f) => $f->owner_id.':'.(int) $f->parent_id)
            ->merge($files->toBase()->map(fn ($f) => $f->owner_id.':'.(int) $f->folder_id))->unique();
        if ($places->count() > 1) {
            abort(422, '只能调整同一个文件夹内的顺序');
        }
        foreach ([...$folders, ...$files] as $item) {
            $this->authorizeOwner($request, $item->owner_id);
        }

        DB::transaction(function () use ($folderIds, $fileIds) {
            foreach ($folderIds as $i => $id) {
                Folder::whereKey($id)->update(['sort_order' => count($folderIds) - $i]);
            }
            foreach ($fileIds as $i => $id) {
                DriveFile::whereKey($id)->update(['sort_order' => count($fileIds) - $i]);
            }
        });
        // Query-builder updates skip model events, so invalidate the public caches here.
        PublicTree::flush();
        Cache::increment('drive:files-version');

        return response()->json(['folders' => count($folderIds), 'files' => count($fileIds)]);
    }

    /** Short-lived signed link (works in download managers, no cookie needed). */
    public function link(Request $request, int $id): JsonResponse
    {
        $file = DriveFile::findOrFail($id);
        $this->authorizeOwner($request, $file->owner_id);
        $url = URL::temporarySignedRoute('drive.download', now()->addHours(12), ['id' => $file->id, 'name' => $file->name], absolute: false);

        return response()->json(['url' => $url, 'preview_url' => Downloader::canPreview($file) ? $url.'&preview=1' : null]);
    }

    public function download(Request $request, int $id): Response
    {
        $file = DriveFile::find($id);
        if (! $file) {
            abort(404, '文件不存在或已被删除');
        }

        return Downloader::send($request, $file, 'owner');
    }

    // ------------------------------------------------------------ helpers

    public static function removeFiles($files): void
    {
        foreach ($files as $file) {
            $path = $file->absolutePath();
            $file->delete();
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    /** Deletes folders recursively with their files. */
    private function deleteFolders(array $folders): array
    {
        $ids = [];
        foreach ($folders as $folder) {
            $ids = array_merge($ids, $folder->descendantIds());
        }
        $ids = array_values(array_unique($ids));
        if (! $ids) {
            return ['files' => 0, 'folders' => 0];
        }
        $files = DriveFile::whereIn('folder_id', $ids)->get();
        self::removeFiles($files);
        // Children before parents (parent_id foreign key).
        $all = Folder::whereIn('id', $ids)->get()->keyBy('id');
        $ordered = $all->sortByDesc(function ($f) use ($all) {
            $depth = 0;
            for ($p = $f; $p->parent_id && isset($all[$p->parent_id]); $p = $all[$p->parent_id]) {
                $depth++;
            }

            return $depth;
        });
        foreach ($ordered as $folder) {
            $folder->delete();
        }

        return ['files' => $files->count(), 'folders' => $all->count()];
    }

    private function moveFolderTo(Request $request, Folder $folder, ?int $parentId): void
    {
        if ($parentId === $folder->parent_id) {
            return;
        }
        if ($parentId !== null) {
            $parent = Folder::findOrFail($parentId);
            $this->authorizeOwner($request, $parent->owner_id);
            if ($parent->owner_id !== $folder->owner_id) {
                abort(422, '不能把文件夹移动到其他用户的目录');
            }
            if (in_array($parentId, $folder->descendantIds(), true)) {
                abort(422, '不能把文件夹移动到它自己或子文件夹中');
            }
        }
        $this->assertFolderNameFree($folder->owner_id, $parentId, $folder->name, $folder->id);
        $folder->parent_id = $parentId;
    }

    private function assertFolderTarget(Request $request, int $ownerId, ?int $folderId): void
    {
        if ($folderId === null) {
            return;
        }
        $target = Folder::findOrFail($folderId);
        $this->authorizeOwner($request, $target->owner_id);
        if ($target->owner_id !== $ownerId && ! $this->user($request)->is_admin) {
            abort(422, '不能移动到其他用户的文件夹');
        }
    }

    private function assertFolderNameFree(int $ownerId, ?int $parentId, string $name, ?int $exceptId = null): void
    {
        $exists = Folder::where('owner_id', $ownerId)->where('parent_id', $parentId)->where('name', $name)
            ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))->exists();
        if ($exists) {
            abort(422, "该位置已存在名为「{$name}」的文件夹");
        }
    }

    private function canPublish(Request $request): bool
    {
        return $this->user($request)->is_admin || $this->settings->get('user_public_folders');
    }

    private function folderArray(Folder $f): array
    {
        return [
            'id' => $f->id, 'name' => $f->name, 'parent_id' => $f->parent_id, 'owner_id' => $f->owner_id,
            'description' => $f->description, 'is_public' => $f->is_public, 'sort_order' => $f->sort_order,
            'created_at' => $f->created_at?->toIso8601String(), 'updated_at' => $f->updated_at?->toIso8601String(),
        ];
    }

    public static function fileArray(DriveFile $f): array
    {
        return [
            'id' => $f->id, 'name' => $f->name, 'size' => $f->size, 'mime_type' => $f->mime_type, 'note' => $f->note,
            'folder_id' => $f->folder_id, 'owner_id' => $f->owner_id, 'downloads' => $f->download_count, 'sort_order' => $f->sort_order,
            'preview' => Downloader::canPreview($f),
            'created_at' => $f->created_at?->toIso8601String(), 'updated_at' => $f->updated_at?->toIso8601String(),
        ];
    }
}
