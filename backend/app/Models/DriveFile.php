<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DriveFile extends Model
{
    protected $table = 'files';

    protected $fillable = ['owner_id', 'folder_id', 'name', 'stored_path', 'size', 'mime_type', 'note', 'download_count'];

    protected $hidden = ['stored_path'];

    protected function casts(): array
    {
        return ['size' => 'integer', 'download_count' => 'integer', 'folder_id' => 'integer', 'owner_id' => 'integer'];
    }

    protected static function booted(): void
    {
        // Public listings are cached per "files version"; any change invalidates them.
        $bump = fn () => Cache::increment('drive:files-version');
        static::saved($bump);
        static::deleted($bump);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'folder_id');
    }

    public function absolutePath(): string
    {
        return rtrim(config('drive.files_path'), '/').'/'.$this->stored_path;
    }

    public function extension(): string
    {
        return strtolower(pathinfo($this->name, PATHINFO_EXTENSION));
    }
}
