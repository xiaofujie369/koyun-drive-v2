<?php

namespace App\Services;

use App\Models\Folder;
use Illuminate\Http\Request;

/**
 * A folder is publicly visible when it and every ancestor are marked public.
 * A visible folder is locked when it or any ancestor has an access password;
 * visitors must unlock every password on the chain. Both maps are small and
 * read on every public request, so they live in the Octane cache and are
 * dropped whenever folders change.
 */
class PublicTree
{
    private const CACHE_KEY = 'drive:public-tree';

    /** @return array{visible: int[], locks: array<int, int[]>} locks: folder id => locked folder ids on its chain, root first */
    private static function tree(): array
    {
        return HotCache::remember(self::CACHE_KEY, 600, function () {
            $rows = Folder::query()->where('is_public', true)->get(['id', 'parent_id', 'access_password'])
                ->groupBy(fn ($f) => (int) $f->parent_id);
            $visible = [];
            $locks = [];
            $frontier = [[0, []]]; // [parent id (0 = root), locks inherited from it]
            while ($frontier) {
                $next = [];
                foreach ($frontier as [$parent, $inherited]) {
                    foreach ($rows->get($parent, []) as $folder) {
                        $chain = $folder->access_password !== null ? [...$inherited, $folder->id] : $inherited;
                        $visible[] = $folder->id;
                        if ($chain) {
                            $locks[$folder->id] = $chain;
                        }
                        $next[] = [$folder->id, $chain];
                    }
                }
                $frontier = $next;
            }

            return ['visible' => $visible, 'locks' => $locks];
        });
    }

    public static function visibleIds(): array
    {
        return self::tree()['visible'];
    }

    public static function isVisible(?int $folderId): bool
    {
        return $folderId !== null && in_array($folderId, self::visibleIds(), true);
    }

    /** Locked folder ids guarding this folder, outermost first (empty = open). */
    public static function locksOf(?int $folderId): array
    {
        return $folderId === null ? [] : (self::tree()['locks'][$folderId] ?? []);
    }

    /** The first lock on the chain this visitor has not opened yet, or null when accessible. */
    public static function pendingLock(Request $request, ?int $folderId): ?int
    {
        $opened = (array) $request->session()->get('folder_unlocked', []);
        foreach (self::locksOf($folderId) as $lock) {
            if (! in_array($lock, $opened, true)) {
                return $lock;
            }
        }

        return null;
    }

    public static function unlock(Request $request, int $lockId): void
    {
        $opened = (array) $request->session()->get('folder_unlocked', []);
        $request->session()->put('folder_unlocked', array_values(array_unique([...$opened, $lockId])));
    }

    /** Folder ids the visitor may list right now (visible and fully unlocked). */
    public static function accessibleIds(Request $request): array
    {
        return array_values(array_filter(self::visibleIds(), fn ($id) => self::pendingLock($request, $id) === null));
    }

    public static function flush(): void
    {
        HotCache::forget(self::CACHE_KEY);
    }
}
