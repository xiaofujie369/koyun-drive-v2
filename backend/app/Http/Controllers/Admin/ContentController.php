<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Controllers\DriveController;
use App\Http\Controllers\UploadController;
use App\Models\AuditLog;
use App\Models\DownloadLog;
use App\Models\DriveFile;
use App\Models\Folder;
use App\Models\LoginLog;
use App\Models\Share;
use App\Models\Upload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Global (all users) listings for the admin panel. Mutations reuse the drive endpoints. */
class ContentController extends Controller
{
    public function files(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $sort = in_array($request->query('sort'), ['name', 'size', 'download_count', 'created_at'], true) ? $request->query('sort') : 'created_at';
        $dir = $request->query('dir') === 'asc' ? 'asc' : 'desc';
        $page = DriveFile::with(['owner:id,username', 'folder:id,name'])
            ->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('name', 'like', '%'.addcslashes($q, '%_\\').'%')
                ->orWhere('note', 'like', '%'.addcslashes($q, '%_\\').'%')))
            ->when($request->filled('owner_id'), fn ($w) => $w->where('owner_id', $request->integer('owner_id')))
            ->when($request->filled('folder_id'), fn ($w) => $request->query('folder_id') === 'root'
                ? $w->whereNull('folder_id') : $w->where('folder_id', $request->integer('folder_id')))
            ->orderBy($sort, $dir)->orderByDesc('id')
            ->paginate(min(200, max(10, $request->integer('per_page', 30))));

        return response()->json([
            'data' => collect($page->items())->map(fn ($f) => DriveController::fileArray($f) + [
                'owner' => $f->owner?->username, 'folder' => $f->folder?->name,
            ]),
            'total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(),
        ]);
    }

    public function folders(): JsonResponse
    {
        $stats = DriveFile::selectRaw('folder_id, COUNT(*) n, COALESCE(SUM(size),0) bytes, COALESCE(SUM(download_count),0) dl')
            ->whereNotNull('folder_id')->groupBy('folder_id')->get()->keyBy('folder_id');

        return response()->json(['folders' => Folder::with('owner:id,username')->orderByDesc('sort_order')->orderBy('name')->get()
            ->map(fn ($f) => [
                'id' => $f->id, 'name' => $f->name, 'parent_id' => $f->parent_id, 'owner_id' => $f->owner_id,
                'owner' => $f->owner?->username, 'description' => $f->description, 'is_public' => $f->is_public,
                'sort_order' => $f->sort_order, 'files' => (int) ($stats[$f->id]->n ?? 0), 'size' => (int) ($stats[$f->id]->bytes ?? 0),
                'downloads' => (int) ($stats[$f->id]->dl ?? 0), 'created_at' => $f->created_at?->toIso8601String(),
            ])]);
    }

    public function shares(Request $request): JsonResponse
    {
        $page = Share::with(['file:id,name', 'folder:id,name', 'user:id,username'])->latest()
            ->paginate(min(100, max(10, $request->integer('per_page', 30))));

        return response()->json([
            'data' => collect($page->items())->map(fn ($s) => $s->toOwnerArray()),
            'total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(),
        ]);
    }

    public function uploads(): JsonResponse
    {
        return response()->json(['uploads' => Upload::with('user:id,username')->where('status', '!=', 'done')->latest('updated_at')->limit(200)->get()
            ->map(fn ($u) => [
                'id' => $u->id, 'name' => $u->name, 'size' => $u->size, 'user' => $u->user?->username,
                'received_chunks' => $u->received_chunks, 'total_chunks' => $u->total_chunks, 'status' => $u->status,
                'created_at' => $u->created_at?->toIso8601String(), 'updated_at' => $u->updated_at?->toIso8601String(),
            ])]);
    }

    public function destroyUpload(string $id): JsonResponse
    {
        UploadController::discard(Upload::findOrFail($id));

        return response()->json(['ok' => true]);
    }

    public function downloads(Request $request): JsonResponse
    {
        $page = DownloadLog::query()
            ->when($request->filled('file_id'), fn ($w) => $w->where('file_id', $request->integer('file_id')))
            ->latest('id')->paginate(min(100, max(10, $request->integer('per_page', 30))));
        $names = DriveFile::whereIn('id', collect($page->items())->pluck('file_id'))->pluck('name', 'id');

        return response()->json([
            'data' => collect($page->items())->map(fn ($l) => $l->toArray() + ['file_name' => $names[$l->file_id] ?? '(已删除)']),
            'total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage(),
        ]);
    }

    public function audit(Request $request): JsonResponse
    {
        $page = AuditLog::latest('id')->paginate(min(100, max(10, $request->integer('per_page', 30))));

        return response()->json(['data' => $page->items(), 'total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage()]);
    }

    public function logins(Request $request): JsonResponse
    {
        $page = LoginLog::latest('id')->paginate(min(100, max(10, $request->integer('per_page', 30))));

        return response()->json(['data' => $page->items(), 'total' => $page->total(), 'page' => $page->currentPage(), 'per_page' => $page->perPage()]);
    }
}
