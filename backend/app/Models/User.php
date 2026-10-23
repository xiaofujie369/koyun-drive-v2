<?php

namespace App\Models;

use App\Services\DriveSettings;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Model
{
    protected $fillable = ['username', 'password', 'is_admin', 'is_active', 'quota_bytes'];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'is_admin' => 'boolean',
            'is_active' => 'boolean',
            'quota_bytes' => 'integer',
            'last_login_at' => 'datetime',
        ];
    }

    public function files(): HasMany
    {
        return $this->hasMany(DriveFile::class, 'owner_id');
    }

    public function folders(): HasMany
    {
        return $this->hasMany(Folder::class, 'owner_id');
    }

    /** Effective quota in bytes; 0 means unlimited. Admins are never limited. */
    public function quota(): int
    {
        if ($this->is_admin) {
            return 0;
        }
        if ($this->quota_bytes !== null) {
            return $this->quota_bytes;
        }

        return (int) (app(DriveSettings::class)->get('default_quota_gb') * 1024 ** 3);
    }

    public function usedBytes(): int
    {
        return (int) DriveFile::where('owner_id', $this->id)->sum('size');
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'username' => $this->username,
            'is_admin' => $this->is_admin,
        ];
    }
}
