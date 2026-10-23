<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Upload extends Model
{
    use HasUuids;

    protected $fillable = ['user_id', 'folder_id', 'fingerprint', 'name', 'size', 'mime_type', 'chunk_size', 'total_chunks', 'received_chunks', 'status', 'file_id'];

    protected function casts(): array
    {
        return ['size' => 'integer', 'chunk_size' => 'integer', 'total_chunks' => 'integer', 'received_chunks' => 'integer', 'folder_id' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function tmpPath(): string
    {
        return rtrim(config('drive.tmp_path'), '/').'/'.$this->id.'.part';
    }

    /** HMAC that authorises chunk PUTs for this upload without cookies (cross-origin). */
    public function token(): string
    {
        return hash_hmac('sha256', 'upload:'.$this->id.':'.$this->user_id, (string) config('app.key'));
    }

    public function chunkLength(int $index): int
    {
        if ($index === $this->total_chunks - 1) {
            return $this->size - $this->chunk_size * ($this->total_chunks - 1);
        }

        return $this->chunk_size;
    }

    public function receivedIndexes(): array
    {
        return UploadChunk::where('upload_id', $this->id)->orderBy('idx')->pluck('idx')->all();
    }
}
