<?php

namespace App\Services;

use App\Models\DownloadLog;
use App\Models\DriveFile;
use App\Models\Share;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Symfony\Component\HttpFoundation\Response;

class Downloader
{
    /** Types safe to render inline on our origin (never HTML/SVG/JS/PDF). */
    private const INLINE_PREFIXES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'video/', 'audio/'];

    public static function canPreview(DriveFile $file): bool
    {
        foreach (self::INLINE_PREFIXES as $prefix) {
            if (str_starts_with($file->mime_type, $prefix)) {
                return true;
            }
        }

        return false;
    }

    public static function send(Request $request, DriveFile $file, string $via, ?Share $share = null): Response
    {
        $path = $file->absolutePath();
        if (! is_file($path)) {
            abort(404, '文件已丢失，请联系管理员');
        }

        $inline = $request->boolean('preview') && self::canPreview($file);
        if (! $inline) {
            self::count($request, $file, $via, $share);
        }

        $disposition = ($inline ? 'inline' : 'attachment')
            ."; filename=\"".self::asciiName($file->name)."\"; filename*=UTF-8''".rawurlencode($file->name);
        $headers = [
            'Content-Type' => $inline ? $file->mime_type : ($file->mime_type ?: 'application/octet-stream'),
            'Content-Disposition' => $disposition,
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
            'Cache-Control' => 'private, max-age=0',
        ];

        $prefix = (string) config('drive.accel_prefix');
        if ($prefix !== '') {
            // nginx serves the bytes (Range/resume support, sendfile, no PHP worker held).
            return response('', 200, $headers + ['X-Accel-Redirect' => $prefix.$file->stored_path, 'X-Accel-Buffering' => 'no']);
        }

        return response()->file($path, $headers);
    }

    /**
     * Download managers open many ranged connections per file; count one
     * download per file+IP per hour so the counter reflects real downloads.
     */
    private static function count(Request $request, DriveFile $file, string $via, ?Share $share): void
    {
        $key = 'dl:'.$file->id.':'.sha1((string) $request->ip());
        if (! Cache::add($key, 1, 3600)) {
            return;
        }
        DriveFile::whereKey($file->id)->increment('download_count');
        $share?->increment('download_count');
        DownloadLog::create([
            'file_id' => $file->id,
            'share_id' => $share?->id,
            'user_id' => $request->session()->get('uid'),
            'via' => $via,
            'size' => $file->size,
            'ip' => (string) $request->ip(),
            'user_agent' => mb_substr((string) $request->userAgent(), 0, 255),
        ]);
    }

    private static function asciiName(string $name): string
    {
        $ascii = preg_replace('/[^\x20-\x7E]|["\\\\]/', '_', $name);

        return $ascii === '' ? 'download' : $ascii;
    }
}
