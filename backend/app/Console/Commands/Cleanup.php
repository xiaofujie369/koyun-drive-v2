<?php

namespace App\Console\Commands;

use App\Http\Controllers\UploadController;
use App\Models\AuditLog;
use App\Models\DownloadLog;
use App\Models\LoginLog;
use App\Models\Upload;
use Illuminate\Console\Command;

class Cleanup extends Command
{
    protected $signature = 'drive:cleanup {--stale-hours=72 : Abandoned uploads older than this are removed}';

    protected $description = 'Remove abandoned chunked uploads, orphan temp files and old logs';

    public function handle(): int
    {
        $stale = Upload::where('status', '!=', 'done')->where('updated_at', '<', now()->subHours((int) $this->option('stale-hours')))->get();
        foreach ($stale as $upload) {
            UploadController::discard($upload);
        }
        $done = Upload::where('status', 'done')->where('updated_at', '<', now()->subDay())->delete();

        // Temp files with no upload row (e.g. after a crash).
        $orphans = 0;
        $known = Upload::where('status', '!=', 'done')->pluck('id')->flip();
        foreach (glob(rtrim(config('drive.tmp_path'), '/').'/*.part') ?: [] as $path) {
            if (! isset($known[basename($path, '.part')]) && filemtime($path) < time() - 3600) {
                @unlink($path);
                $orphans++;
            }
        }

        DownloadLog::where('created_at', '<', now()->subDays(365))->delete();
        LoginLog::where('created_at', '<', now()->subDays(180))->delete();
        AuditLog::where('created_at', '<', now()->subDays(365))->delete();

        $this->info("stale uploads: {$stale->count()}, finished sessions: {$done}, orphan temp files: {$orphans}");

        return self::SUCCESS;
    }
}
