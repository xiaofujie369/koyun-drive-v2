<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Share extends Model
{
    protected $fillable = ['token', 'user_id', 'file_id', 'folder_id', 'password', 'expires_at', 'max_downloads', 'download_count', 'view_count'];

    protected function casts(): array
    {
        return ['expires_at' => 'datetime', 'max_downloads' => 'integer', 'download_count' => 'integer', 'view_count' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(DriveFile::class, 'file_id');
    }

    public function folder(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'folder_id');
    }

    /** Null when usable, otherwise the reason it is not. */
    public function unavailableReason(): ?string
    {
        if ($this->expires_at && $this->expires_at->isPast()) {
            return '分享链接已过期';
        }
        if ($this->max_downloads && $this->download_count >= $this->max_downloads) {
            return '分享链接下载次数已用完';
        }
        if (! $this->file_id && ! $this->folder_id) {
            return '分享的文件已被删除';
        }

        return null;
    }

    public function toOwnerArray(): array
    {
        return [
            'id' => $this->id,
            'token' => $this->token,
            'type' => $this->file_id ? 'file' : 'folder',
            'name' => $this->file?->name ?? $this->folder?->name ?? '(已删除)',
            'password' => $this->password,
            'expires_at' => $this->expires_at?->toIso8601String(),
            'max_downloads' => $this->max_downloads,
            'download_count' => $this->download_count,
            'view_count' => $this->view_count,
            'created_at' => $this->created_at?->toIso8601String(),
            'owner' => $this->user?->username,
            'status' => $this->unavailableReason() ? 'invalid' : 'active',
            'status_text' => $this->unavailableReason(),
        ];
    }
}
