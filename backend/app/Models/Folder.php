<?php

namespace App\Models;

use App\Services\PublicTree;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Folder extends Model
{
    protected $hidden = ['access_password'];

    protected $fillable = ['owner_id', 'parent_id', 'name', 'description', 'is_public', 'access_password', 'sort_order'];

    protected function casts(): array
    {
        return ['is_public' => 'boolean', 'sort_order' => 'integer', 'parent_id' => 'integer', 'owner_id' => 'integer'];
    }

    protected static function booted(): void
    {
        $flush = function () {
            PublicTree::flush();
            Cache::increment('drive:files-version');
        };
        static::saved($flush);
        static::deleted($flush);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Folder::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(Folder::class, 'parent_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(DriveFile::class, 'folder_id');
    }

    /** Ancestors from the root down to (and including) this folder. */
    public function breadcrumbs(): array
    {
        $chain = [];
        $node = $this;
        $guard = 0;
        while ($node && $guard++ < 64) {
            array_unshift($chain, ['id' => $node->id, 'name' => $node->name, 'is_public' => $node->is_public]);
            $node = $node->parent_id ? Folder::find($node->parent_id) : null;
        }

        return $chain;
    }

    /** IDs of this folder and every folder below it. */
    public function descendantIds(): array
    {
        $ids = [$this->id];
        $frontier = [$this->id];
        while ($frontier) {
            $frontier = Folder::whereIn('parent_id', $frontier)->pluck('id')->all();
            $ids = array_merge($ids, $frontier);
        }

        return $ids;
    }
}
