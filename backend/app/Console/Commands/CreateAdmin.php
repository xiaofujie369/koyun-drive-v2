<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class CreateAdmin extends Command
{
    protected $signature = 'drive:admin {username} {--password= : Leave empty to generate one}';

    protected $description = 'Create an administrator, or reset an existing user to admin with a new password';

    public function handle(): int
    {
        $password = (string) ($this->option('password') ?: Str::password(16, symbols: false));
        $user = User::firstOrNew(['username' => $this->argument('username')]);
        $user->fill(['password' => $password, 'is_admin' => true, 'is_active' => true])->save();
        $this->line("username: {$user->username}");
        $this->line("password: {$password}");

        return self::SUCCESS;
    }
}
