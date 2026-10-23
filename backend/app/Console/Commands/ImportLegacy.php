<?php

namespace App\Console\Commands;

use App\Models\DriveFile;
use App\Models\Folder;
use App\Models\Share;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PDO;

/**
 * Imports the v1 (FastAPI + SQLite) data: users with their password hashes,
 * files (keeping their IDs so old /public-download/{id} links still work),
 * the flat "folder" labels as public top-level folders, and share tokens.
 */
class ImportLegacy extends Command
{
    protected $signature = 'drive:import-legacy {sqlite : Path to koyun_drive.sqlite3} {uploads : Old uploads directory}
        {--weak-password=* : Known default passwords; matching accounts get a new random password}';

    protected $description = 'Import data from Koyun Drive v1';

    public function handle(): int
    {
        if (User::exists() || DriveFile::exists()) {
            $this->error('Target database is not empty; refusing to import twice.');

            return self::FAILURE;
        }
        $pdo = new PDO('sqlite:'.$this->argument('sqlite'), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $uploads = rtrim($this->argument('uploads'), '/');
        $filesRoot = rtrim(config('drive.files_path'), '/');
        $resets = [];

        DB::transaction(function () use ($pdo, $uploads, $filesRoot, &$resets) {
            foreach ($pdo->query('SELECT * FROM users ORDER BY id') as $u) {
                // passlib writes $2b$; PHP's bcrypt verifier expects the identical $2y$ variant.
                $hash = preg_replace('/^\$2[ab]\$/', '\$2y\$', $u['password_hash']);
                $user = new User;
                $user->forceFill([
                    'id' => $u['id'], 'username' => $u['username'], 'password' => $hash,
                    'is_admin' => (bool) $u['is_admin'], 'is_active' => (bool) $u['is_active'],
                    'created_at' => date('Y-m-d H:i:s', (int) $u['created_at']), 'updated_at' => now(),
                ]);
                foreach ($this->option('weak-password') as $weak) {
                    if ($weak !== '' && password_verify($weak, $hash)) {
                        $new = Str::password(16, symbols: false);
                        $user->password = Hash::make($new);
                        $resets[$u['username']] = $new;
                        break;
                    }
                }
                $user->saveQuietly();
            }

            $admin = User::where('is_admin', true)->orderBy('id')->firstOrFail();
            $folders = [];
            foreach ($pdo->query('SELECT * FROM files ORDER BY id') as $f) {
                $label = trim((string) ($f['folder'] ?? '')) ?: '默认文件夹';
                $folders[$label] ??= Folder::create(['owner_id' => $admin->id, 'name' => $label, 'is_public' => true])->id;

                $src = $uploads.'/'.$f['stored_name'];
                $created = (int) $f['created_at'];
                $stored = date('Y/m', $created).'/'.Str::uuid()->toString();
                $dest = $filesRoot.'/'.$stored;
                if (! is_dir(dirname($dest))) {
                    mkdir(dirname($dest), 0755, true);
                }
                if (! is_file($src) || ! copy($src, $dest)) {
                    $this->warn("missing physical file for #{$f['id']} {$f['original_name']} — skipped");
                    continue;
                }
                @chmod($dest, 0644);
                $file = new DriveFile;
                $file->forceFill([
                    'id' => $f['id'], 'owner_id' => $admin->id, 'folder_id' => $folders[$label],
                    'name' => $f['original_name'], 'stored_path' => $stored, 'size' => filesize($dest),
                    'mime_type' => $f['mime_type'] ?: 'application/octet-stream', 'note' => (string) ($f['note'] ?? ''),
                    'download_count' => (int) ($f['download_count'] ?? 0),
                    'created_at' => date('Y-m-d H:i:s', $created), 'updated_at' => date('Y-m-d H:i:s', $created),
                ])->saveQuietly();
                $this->line("file #{$file->id} {$file->name} -> {$label}");
            }

            foreach ($pdo->query('SELECT * FROM shares ORDER BY id') as $s) {
                if (! DriveFile::whereKey($s['file_id'])->exists()) {
                    continue;
                }
                Share::create([
                    'token' => $s['token'], 'user_id' => User::whereKey($s['created_by'])->exists() ? $s['created_by'] : $admin->id,
                    'file_id' => $s['file_id'], 'expires_at' => $s['expires_at'] ? date('Y-m-d H:i:s', (int) $s['expires_at']) : null,
                    'created_at' => date('Y-m-d H:i:s', (int) $s['created_at']),
                ]);
            }
        });

        $this->info(sprintf('Imported %d users, %d folders, %d files, %d shares.', User::count(), Folder::count(), DriveFile::count(), Share::count()));
        foreach ($resets as $name => $password) {
            $this->warn("Account '{$name}' used a default password; new password: {$password}");
        }

        return self::SUCCESS;
    }
}
