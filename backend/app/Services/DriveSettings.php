<?php

namespace App\Services;

use App\Models\Setting;

class DriveSettings
{
    private const CACHE_KEY = 'drive:settings';

    public function all(): array
    {
        $saved = HotCache::remember(self::CACHE_KEY, 300, fn () => Setting::query()->pluck('value', 'key')->all());
        $out = [];
        foreach (config('drive.defaults') as $key => $default) {
            $out[$key] = array_key_exists($key, $saved) ? $this->cast(json_decode($saved[$key], true), $default) : $default;
        }

        return $out;
    }

    public function get(string $key): mixed
    {
        return $this->all()[$key] ?? null;
    }

    public function save(array $values): void
    {
        $defaults = config('drive.defaults');
        foreach ($values as $key => $value) {
            if (array_key_exists($key, $defaults)) {
                Setting::updateOrCreate(['key' => $key], ['value' => json_encode($this->cast($value, $defaults[$key]), JSON_UNESCAPED_UNICODE)]);
            }
        }
        HotCache::forget(self::CACHE_KEY);
    }

    public function chunkSize(): int
    {
        return max(1, min(32, (int) $this->get('chunk_size_mb'))) * 1024 * 1024;
    }

    public function maxFileSize(): int
    {
        return (int) ($this->get('max_file_size_gb') * 1024 ** 3);
    }

    private function cast(mixed $value, mixed $default): mixed
    {
        return match (true) {
            is_bool($default) => (bool) $value,
            is_int($default) => (int) $value,
            is_float($default) => (float) $value,
            default => (string) ($value ?? ''),
        };
    }
}
