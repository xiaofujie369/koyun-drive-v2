<?php

namespace App\Http\Controllers;

use App\Http\Middleware\Authenticate;
use App\Models\DriveFile;
use App\Models\Folder;
use App\Services\Downloader;
use App\Services\DriveSettings;
use App\Services\PublicTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class PublicController extends Controller
{
    public function __construct(private readonly DriveSettings $settings) {}

    public function config(Request $request): JsonResponse
    {
        $s = $this->settings->all();
        $user = Authenticate::resolve($request);

        return response()->json([
            'site_name' => $s['site_name'],
            'public_url' => rtrim((string) config('app.url'), '/'),
            'site_subtitle' => $s['site_subtitle'],
            'announcement' => $s['announcement'],
            'upload_url' => rtrim($s['upload_url'], '/'),
            'chunk_size' => $this->settings->chunkSize(),
            'max_file_size' => $this->settings->maxFileSize(),
            'allow_register' => $s['allow_register'],
            'public_search' => $s['public_search'],
            'user_public_folders' => $s['user_public_folders'],
            'download_requires_login' => $s['download_requires_login'],
            'user' => $user ? $user->toPublic() + ['quota' => $user->quota(), 'used' => $user->usedBytes()] : null,
        ]);
    }

    /** Home page: the public top-level folders with recursive file counts. */
    public function home(): JsonResponse
    {
        $visible = PublicTree::visibleIds();
        $data = Cache::remember('drive:public-home:'.md5(implode(',', $visible)).':'.$this->filesVersion(), 120, function () use ($visible) {
            $folders = Folder::whereIn('id', $visible)->get(['id', 'parent_id', 'name', 'description', 'sort_order', 'updated_at'])->keyBy('id');
            $stats = DriveFile::whereIn('folder_id', $visible)
                ->selectRaw('folder_id, COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes, COALESCE(SUM(download_count),0) AS dl, MAX(created_at) AS latest')
                ->groupBy('folder_id')->get()->keyBy('folder_id');

            // Roll file stats up to each top-level public folder.
            $roots = [];
            foreach ($folders as $folder) {
                $root = $folder;
                while ($root->parent_id && isset($folders[$root->parent_id])) {
                    $root = $folders[$root->parent_id];
                }
                $s = $stats->get($folder->id);
                $r = &$roots[$root->id];
                $r['files'] = ($r['files'] ?? 0) + (int) ($s->n ?? 0);
                $r['size'] = ($r['size'] ?? 0) + (int) ($s->bytes ?? 0);
                $r['downloads'] = ($r['downloads'] ?? 0) + (int) ($s->dl ?? 0);
                $r['latest'] = max($r['latest'] ?? '', (string) ($s->latest ?? ''));
                $r['subfolders'] = ($r['subfolders'] ?? 0) + ($folder->id !== $root->id ? 1 : 0);
                unset($r);
            }

            $list = $folders->filter(fn ($f) => ! $f->parent_id)
                ->sortBy([['sort_order', 'desc'], ['name', 'asc']])->values()
                ->map(fn ($f) => [
                    'id' => $f->id, 'name' => $f->name, 'description' => $f->description,
                    'files' => $roots[$f->id]['files'] ?? 0, 'size' => $roots[$f->id]['size'] ?? 0,
                    'downloads' => $roots[$f->id]['downloads'] ?? 0, 'subfolders' => $roots[$f->id]['subfolders'] ?? 0,
                    'updated_at' => ($roots[$f->id]['latest'] ?? '') ?: $f->updated_at?->toDateTimeString(),
                ]);

            return [
                'folders' => $list,
                'stats' => [
                    'folders' => $list->count(),
                    'files' => (int) $stats->sum('n'),
                    'size' => (int) $stats->sum('bytes'),
                    'downloads' => (int) $stats->sum('dl'),
                ],
            ];
        });

        return response()->json($data);
    }

    public function folder(int $id): JsonResponse
    {
        if (! PublicTree::isVisible($id)) {
            abort(404, '文件夹不存在或未公开');
        }
        $folder = Folder::findOrFail($id);
        $visible = PublicTree::visibleIds();

        return response()->json([
            'folder' => ['id' => $folder->id, 'name' => $folder->name, 'description' => $folder->description],
            'breadcrumbs' => $folder->breadcrumbs(),
            'folders' => Folder::where('parent_id', $id)->whereIn('id', $visible)
                ->orderByDesc('sort_order')->orderBy('name')->get(['id', 'name', 'description'])
                ->map(fn ($f) => $f->toArray() + [
                    'files' => DriveFile::where('folder_id', $f->id)->count(),
                ]),
            'files' => DriveFile::where('folder_id', $id)->orderBy('name')->get()->map(fn ($f) => $this->publicFile($f)),
        ]);
    }

    public function search(Request $request): JsonResponse
    {
        if (! $this->settings->get('public_search')) {
            abort(403, '搜索功能已关闭');
        }
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 1) {
            return response()->json(['files' => []]);
        }
        $like = '%'.addcslashes($q, '%_\\').'%';
        $files = DriveFile::with('folder:id,name')->whereIn('folder_id', PublicTree::visibleIds())
            ->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('note', 'like', $like))
            ->orderByDesc('download_count')->limit(100)->get();

        return response()->json(['files' => $files->map(fn ($f) => $this->publicFile($f) + ['folder' => $f->folder?->only(['id', 'name'])])]);
    }

    /** Direct link for files in public folders: /d/{id}/{name}. */
    public function download(Request $request, int $id): Response
    {
        $file = DriveFile::find($id);
        if (! $file) {
            abort(404, '文件不存在或已被删除');
        }
        $user = Authenticate::resolve($request);
        $owner = $user && ($user->is_admin || $user->id === $file->owner_id);
        if (! $owner && ! PublicTree::isVisible($file->folder_id)) {
            abort(404, '文件不存在或未公开');
        }
        if (! $user && $this->settings->get('download_requires_login')) {
            abort(401, '请先登录后再下载');
        }

        return Downloader::send($request, $file, $owner ? 'owner' : 'public');
    }

    /** Old /folder/<name> links from the previous version. */
    public function legacyFolder(string $name): RedirectResponse
    {
        $folder = Folder::whereNull('parent_id')->where('name', $name)->whereIn('id', PublicTree::visibleIds())->first();

        return redirect($folder ? '/folder/'.$folder->id : '/', 301);
    }

    private function publicFile(DriveFile $f): array
    {
        return [
            'id' => $f->id, 'name' => $f->name, 'size' => $f->size, 'mime_type' => $f->mime_type, 'note' => $f->note,
            'downloads' => $f->download_count, 'created_at' => $f->created_at?->toIso8601String(),
            'url' => '/d/'.$f->id.'/'.rawurlencode($f->name), 'preview' => Downloader::canPreview($f),
        ];
    }

    private function filesVersion(): int
    {
        return (int) Cache::get('drive:files-version', 0);
    }
}
