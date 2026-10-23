<?php

namespace App\Services;

use App\Models\Folder;

/**
 * A folder is publicly visible when it and every ancestor are marked public.
 * The visible set is small and read on every public request, so it is kept
 * in the Octane cache and dropped whenever folders change.
 */
class PublicTree
{
    private const CACHE_KEY = 'drive:public-folder-ids';

    public static function visibleIds(): array
    {
        return HotCache::remember(self::CACHE_KEY, 600, function () {
            $rows = Folder::query()->where('is_public', true)->get(['id', 'parent_id'])->groupBy(fn ($f) => (int) $f->parent_id);
            $visible = [];
            $frontier = [0]; // 0 = root (parent_id null)
            while ($frontier) {
                $next = [];
                foreach ($frontier as $parent) {
                    foreach ($rows->get($parent, []) as $folder) {
                        $visible[] = $folder->id;
                        $next[] = $folder->id;
                    }
                }
                $frontier = $next;
            }

            return $visible;
        });
    }

    public static function isVisible(?int $folderId): bool
    {
        return $folderId !== null && in_array($folderId, self::visibleIds(), true);
    }

    public static function flush(): void
    {
        HotCache::forget(self::CACHE_KEY);
    }
}
