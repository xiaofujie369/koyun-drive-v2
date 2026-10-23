<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DownloadLog;
use App\Models\DriveFile;
use App\Models\Folder;
use App\Models\Share;
use App\Models\Upload;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        $path = config('drive.files_path');
        $today = Carbon::today();

        return response()->json([
            'users' => ['total' => User::count(), 'active' => User::where('is_active', true)->count(), 'admins' => User::where('is_admin', true)->count()],
            'files' => [
                'total' => DriveFile::count(),
                'size' => (int) DriveFile::sum('size'),
                'today' => DriveFile::where('created_at', '>=', $today)->count(),
                'folders' => Folder::count(),
                'public_folders' => Folder::where('is_public', true)->count(),
            ],
            'downloads' => [
                'total' => (int) DriveFile::sum('download_count'),
                'today' => DownloadLog::where('created_at', '>=', $today)->count(),
                'yesterday' => DownloadLog::whereBetween('created_at', [$today->copy()->subDay(), $today])->count(),
                'week' => DownloadLog::where('created_at', '>=', $today->copy()->subDays(6))->count(),
                'bytes_today' => (int) DownloadLog::where('created_at', '>=', $today)->sum('size'),
            ],
            'shares' => ['total' => Share::count(), 'active' => Share::get()->filter(fn ($s) => ! $s->unavailableReason())->count()],
            'uploads' => ['active' => Upload::where('status', 'uploading')->count(), 'pending_bytes' => (int) Upload::where('status', 'uploading')->sum('size')],
            'disk' => ['total' => (int) @disk_total_space($path), 'free' => (int) @disk_free_space($path)],
            'top_files' => DriveFile::orderByDesc('download_count')->limit(8)->get(['id', 'name', 'size', 'download_count']),
            'recent_files' => DriveFile::with('owner:id,username')->latest()->limit(8)->get(['id', 'name', 'size', 'owner_id', 'created_at']),
        ]);
    }

    /** Daily downloads / traffic / new files for the chart. */
    public function traffic(Request $request): JsonResponse
    {
        $days = max(7, min(90, $request->integer('days', 30)));
        $since = Carbon::today()->subDays($days - 1);
        $dl = DownloadLog::where('created_at', '>=', $since)
            ->selectRaw('DATE(created_at) d, COUNT(*) n, COALESCE(SUM(size),0) bytes')->groupBy('d')->get()->keyBy('d');
        $up = DriveFile::where('created_at', '>=', $since)
            ->selectRaw('DATE(created_at) d, COUNT(*) n, COALESCE(SUM(size),0) bytes')->groupBy('d')->get()->keyBy('d');
        $series = [];
        for ($day = $since->copy(); $day->lte(Carbon::today()); $day->addDay()) {
            $k = $day->toDateString();
            $series[] = [
                'day' => $k,
                'downloads' => (int) ($dl[$k]->n ?? 0), 'download_bytes' => (int) ($dl[$k]->bytes ?? 0),
                'uploads' => (int) ($up[$k]->n ?? 0), 'upload_bytes' => (int) ($up[$k]->bytes ?? 0),
            ];
        }

        return response()->json(['series' => $series]);
    }
}
