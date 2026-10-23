<?php

namespace App\Http\Controllers;

use App\Http\Middleware\Authenticate;
use App\Models\DriveFile;
use App\Models\Folder;
use App\Models\Upload;
use App\Models\UploadChunk;
use App\Services\DriveSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Resumable chunked uploads.
 *
 *   POST   /kd/uploads                     start (or resume by fingerprint)
 *   PUT    /kd/uploads/{id}/chunks/{n}     raw chunk body, X-Upload-Token header
 *   POST   /kd/uploads/{id}/complete       assemble and create the file
 *   DELETE /kd/uploads/{id}                cancel
 *
 * Chunks are written straight into a single sparse temp file at their offset,
 * so completing an upload is a rename, not a multi-GB merge.
 */
class UploadController extends Controller
{
    public function __construct(private readonly DriveSettings $settings) {}

    public function init(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:180'],
            'size' => ['required', 'integer', 'min:0'],
            'mime_type' => ['nullable', 'string', 'max:150'],
            'folder_id' => ['nullable', 'integer', 'exists:folders,id'],
            'fingerprint' => ['required', 'string', 'max:180'],
        ], [], ['name' => '文件名', 'size' => '文件大小']);

        $name = $this->cleanName($data['name']);
        $size = (int) $data['size'];
        $folderId = $data['folder_id'] ?? null;
        if ($folderId) {
            $this->authorizeOwner($request, Folder::findOrFail($folderId)->owner_id);
        }

        // Resume an unfinished upload of the same file to the same place.
        $existing = Upload::where('user_id', $user->id)->where('fingerprint', $data['fingerprint'])
            ->where('folder_id', $folderId)->where('size', $size)->where('status', 'uploading')->latest()->first();
        if ($existing && is_file($existing->tmpPath())) {
            $existing->touch();

            return response()->json($this->sessionPayload($existing, true));
        }

        $max = $this->settings->maxFileSize();
        if ($max > 0 && $size > $max) {
            abort(413, '文件超过单文件上限 '.$this->settings->get('max_file_size_gb').' GB');
        }
        $quota = $user->quota();
        if ($quota > 0) {
            $pending = (int) Upload::where('user_id', $user->id)->where('status', 'uploading')->sum('size');
            if ($user->usedBytes() + $pending + $size > $quota) {
                abort(413, '存储空间不足（已用 + 上传中 + 本文件 超过配额）');
            }
        }
        $tmpDir = config('drive.tmp_path');
        if (! is_dir($tmpDir)) {
            mkdir($tmpDir, 0755, true);
        }
        $free = @disk_free_space($tmpDir);
        if ($free !== false && $free < $size + 512 * 1024 * 1024) {
            abort(507, '服务器磁盘空间不足，请联系管理员');
        }

        $chunk = $this->settings->chunkSize();
        $upload = Upload::create([
            'user_id' => $user->id,
            'folder_id' => $folderId,
            'fingerprint' => $data['fingerprint'],
            'name' => $name,
            'size' => $size,
            'mime_type' => $this->mime($data['mime_type'] ?? '', $name),
            'chunk_size' => $chunk,
            'total_chunks' => max(1, (int) ceil($size / $chunk)),
        ]);
        touch($upload->tmpPath());

        return response()->json($this->sessionPayload($upload, false), 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $upload = $this->ownUpload($request, $id);

        return response()->json($this->sessionPayload($upload, true));
    }

    /** Session-less endpoint (may be called cross-origin); authorised by the upload token. */
    public function chunk(Request $request, string $id, int $index): JsonResponse
    {
        $upload = Upload::find($id);
        if (! $upload || ! hash_equals($upload->token(), (string) $request->header('X-Upload-Token'))) {
            abort(404, '上传会话不存在或已过期');
        }
        if ($upload->status !== 'uploading') {
            abort(409, '该上传已完成或已取消');
        }
        if ($index < 0 || $index >= $upload->total_chunks) {
            abort(422, '分片序号无效');
        }
        $body = $request->getContent();
        $expected = $upload->chunkLength($index);
        if (strlen($body) !== $expected) {
            abort(422, "分片大小不匹配（期望 {$expected} 字节，收到 ".strlen($body).' 字节）');
        }

        $fh = @fopen($upload->tmpPath(), 'c');
        if (! $fh) {
            abort(410, '上传临时文件已丢失，请重新上传');
        }
        try {
            fseek($fh, $index * $upload->chunk_size);
            if (fwrite($fh, $body) !== $expected) {
                abort(507, '写入失败，服务器磁盘可能已满');
            }
            fflush($fh);
        } finally {
            fclose($fh);
        }
        unset($body);

        UploadChunk::insertOrIgnore(['upload_id' => $upload->id, 'idx' => $index]);
        $received = UploadChunk::where('upload_id', $upload->id)->count();
        Upload::whereKey($upload->id)->update(['received_chunks' => $received, 'updated_at' => now()]);

        return response()->json(['received' => $received, 'total' => $upload->total_chunks]);
    }

    public function complete(Request $request, string $id): JsonResponse
    {
        $upload = $this->ownUpload($request, $id);
        if ($upload->status === 'done' && $upload->file_id && ($file = DriveFile::find($upload->file_id))) {
            return response()->json(['file' => DriveController::fileArray($file)]);
        }
        $received = $upload->receivedIndexes();
        if (count($received) !== $upload->total_chunks) {
            return response()->json([
                'error' => '还有分片未上传完成',
                'missing' => array_values(array_diff(range(0, $upload->total_chunks - 1), $received)),
            ], 409);
        }
        // Claim the upload so a double "complete" cannot create two files.
        if (! Upload::whereKey($upload->id)->where('status', 'uploading')->update(['status' => 'merging'])) {
            abort(409, '该上传正在处理中，请稍候');
        }

        try {
            $tmp = $upload->tmpPath();
            clearstatcache(true, $tmp);
            if (! is_file($tmp) || filesize($tmp) !== $upload->size) {
                throw new \RuntimeException('临时文件大小与预期不符，请重新上传');
            }
            $stored = now()->format('Y/m').'/'.Str::uuid()->toString();
            $dest = rtrim(config('drive.files_path'), '/').'/'.$stored;
            if (! is_dir(dirname($dest))) {
                mkdir(dirname($dest), 0755, true);
            }
            if (! rename($tmp, $dest)) {
                throw new \RuntimeException('保存文件失败');
            }
            @chmod($dest, 0644);

            $folderId = $upload->folder_id;
            if ($folderId && ! Folder::whereKey($folderId)->exists()) {
                $folderId = null; // target folder was deleted meanwhile
            }
            $ownerId = $folderId ? Folder::whereKey($folderId)->value('owner_id') : $upload->user_id;

            $file = DB::transaction(function () use ($upload, $stored, $folderId, $ownerId) {
                $file = DriveFile::create([
                    'owner_id' => $ownerId,
                    'folder_id' => $folderId,
                    'name' => $this->uniqueName($ownerId, $folderId, $upload->name),
                    'stored_path' => $stored,
                    'size' => $upload->size,
                    'mime_type' => $upload->mime_type,
                ]);
                $upload->update(['status' => 'done', 'file_id' => $file->id]);
                UploadChunk::where('upload_id', $upload->id)->delete();

                return $file;
            });
        } catch (\Throwable $e) {
            if (isset($dest) && is_file($dest) && ! is_file($tmp)) {
                @rename($dest, $tmp); // keep the upload resumable
            }
            Upload::whereKey($upload->id)->update(['status' => 'uploading']);
            report($e);
            abort(500, $e instanceof \RuntimeException ? $e->getMessage() : '保存文件失败');
        }

        return response()->json(['file' => DriveController::fileArray($file)], 201);
    }

    public function cancel(Request $request, string $id): JsonResponse
    {
        $upload = $this->ownUpload($request, $id);
        self::discard($upload);

        return response()->json(['ok' => true]);
    }

    public static function discard(Upload $upload): void
    {
        if ($upload->status !== 'done') {
            @unlink($upload->tmpPath());
        }
        UploadChunk::where('upload_id', $upload->id)->delete();
        $upload->delete();
    }

    private function ownUpload(Request $request, string $id): Upload
    {
        $upload = Upload::find($id);
        if (! $upload) {
            abort(404, '上传会话不存在或已过期');
        }
        $user = Authenticate::resolve($request);
        if (! $user || (! $user->is_admin && $upload->user_id !== $user->id)) {
            abort(404, '上传会话不存在或已过期');
        }

        return $upload;
    }

    private function sessionPayload(Upload $upload, bool $resumed): array
    {
        $base = rtrim((string) $this->settings->get('upload_url'), '/');

        return [
            'id' => $upload->id,
            'token' => $upload->token(),
            'chunk_size' => $upload->chunk_size,
            'total_chunks' => $upload->total_chunks,
            'uploaded' => $upload->receivedIndexes(),
            'resumed' => $resumed,
            'status' => $upload->status,
            'chunk_url' => ($base ?: '').'/kd/uploads/'.$upload->id.'/chunks/',
        ];
    }

    private function cleanName(string $name): string
    {
        $name = trim(str_replace(['/', '\\', "\0"], '_', $name));
        $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
        if ($name === '' || $name === '.' || $name === '..') {
            $name = 'unnamed';
        }

        return mb_substr($name, 0, 180);
    }

    /** "a.zip" -> "a (1).zip" when the name is taken in that folder. */
    private function uniqueName(int $ownerId, ?int $folderId, string $name): string
    {
        $taken = fn ($n) => DriveFile::where('owner_id', $ownerId)->where('folder_id', $folderId)->where('name', $n)->exists();
        if (! $taken($name)) {
            return $name;
        }
        $ext = pathinfo($name, PATHINFO_EXTENSION);
        $stem = $ext !== '' ? mb_substr($name, 0, -(mb_strlen($ext) + 1)) : $name;
        for ($i = 1; $i < 1000; $i++) {
            $candidate = $stem." ($i)".($ext !== '' ? ".$ext" : '');
            if (! $taken($candidate)) {
                return $candidate;
            }
        }

        return $stem.' '.Str::random(6).($ext !== '' ? ".$ext" : '');
    }

    private function mime(string $given, string $name): string
    {
        $given = strtolower(trim($given));
        if ($given !== '' && preg_match('#^[a-z0-9.+-]+/[a-z0-9.+-]+$#', $given)) {
            return $given;
        }
        $map = [
            'apk' => 'application/vnd.android.package-archive', 'exe' => 'application/x-msdownload', 'msi' => 'application/x-msi',
            'dmg' => 'application/x-apple-diskimage', 'zip' => 'application/zip', '7z' => 'application/x-7z-compressed',
            'rar' => 'application/vnd.rar', 'gz' => 'application/gzip', 'deb' => 'application/vnd.debian.binary-package',
            'pdf' => 'application/pdf', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'gif' => 'image/gif',
            'webp' => 'image/webp', 'mp4' => 'video/mp4', 'webm' => 'video/webm', 'mp3' => 'audio/mpeg', 'txt' => 'text/plain',
            'ipa' => 'application/octet-stream',
        ];

        return $map[strtolower(pathinfo($name, PATHINFO_EXTENSION))] ?? 'application/octet-stream';
    }
}
