<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $t) {
            $t->id();
            $t->string('username', 64)->unique();
            $t->string('password');
            $t->boolean('is_admin')->default(false);
            $t->boolean('is_active')->default(true);
            $t->unsignedBigInteger('quota_bytes')->nullable(); // null = use default setting, 0 = unlimited
            $t->timestamp('last_login_at')->nullable();
            $t->string('last_login_ip', 64)->nullable();
            $t->timestamps();
        });

        Schema::create('folders', function (Blueprint $t) {
            $t->id();
            $t->foreignId('owner_id')->constrained('users');
            $t->foreignId('parent_id')->nullable()->constrained('folders');
            $t->string('name', 191);
            $t->string('description', 500)->default('');
            $t->boolean('is_public')->default(false);
            $t->integer('sort_order')->default(0);
            $t->timestamps();
            $t->index(['owner_id', 'parent_id']);
            $t->index(['parent_id', 'is_public']);
        });

        Schema::create('files', function (Blueprint $t) {
            $t->id();
            $t->foreignId('owner_id')->constrained('users');
            $t->foreignId('folder_id')->nullable()->constrained('folders');
            $t->string('name', 191);
            $t->string('stored_path', 191)->unique();
            $t->unsignedBigInteger('size');
            $t->string('mime_type', 191)->default('application/octet-stream');
            $t->string('note', 1000)->default('');
            $t->unsignedBigInteger('download_count')->default(0);
            $t->timestamps();
            $t->index(['owner_id', 'folder_id']);
            $t->index(['folder_id', 'name']);
        });

        Schema::create('shares', function (Blueprint $t) {
            $t->id();
            $t->string('token', 64)->unique();
            $t->foreignId('user_id')->constrained('users');
            $t->foreignId('file_id')->nullable()->constrained('files')->cascadeOnDelete();
            $t->foreignId('folder_id')->nullable()->constrained('folders')->cascadeOnDelete();
            $t->string('password', 32)->nullable();
            $t->timestamp('expires_at')->nullable();
            $t->unsignedInteger('max_downloads')->nullable();
            $t->unsignedBigInteger('download_count')->default(0);
            $t->unsignedBigInteger('view_count')->default(0);
            $t->timestamps();
        });

        Schema::create('uploads', function (Blueprint $t) {
            $t->uuid('id')->primary();
            $t->foreignId('user_id')->constrained('users');
            $t->foreignId('folder_id')->nullable()->constrained('folders')->nullOnDelete();
            $t->string('fingerprint', 191);
            $t->string('name', 191);
            $t->unsignedBigInteger('size');
            $t->string('mime_type', 191)->default('application/octet-stream');
            $t->unsignedInteger('chunk_size');
            $t->unsignedInteger('total_chunks');
            $t->unsignedInteger('received_chunks')->default(0);
            $t->string('status', 16)->default('uploading'); // uploading | done
            $t->foreignId('file_id')->nullable();
            $t->timestamps();
            $t->index(['user_id', 'fingerprint', 'status']);
            $t->index(['status', 'updated_at']);
        });

        Schema::create('upload_chunks', function (Blueprint $t) {
            $t->uuid('upload_id');
            $t->unsignedInteger('idx');
            $t->primary(['upload_id', 'idx']);
        });

        Schema::create('download_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('file_id')->index();
            $t->unsignedBigInteger('share_id')->nullable();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->string('via', 16); // public | share | owner
            $t->unsignedBigInteger('size');
            $t->string('ip', 64);
            $t->string('user_agent', 255)->default('');
            $t->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('settings', function (Blueprint $t) {
            $t->string('key', 64)->primary();
            $t->text('value');
        });

        Schema::create('audit_logs', function (Blueprint $t) {
            $t->id();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->string('username', 64)->default('');
            $t->string('action', 96)->index();
            $t->string('target', 191)->nullable();
            $t->json('details')->nullable();
            $t->boolean('success')->default(true);
            $t->string('ip', 64);
            $t->string('user_agent', 255)->default('');
            $t->timestamp('created_at')->useCurrent()->index();
        });

        Schema::create('login_logs', function (Blueprint $t) {
            $t->id();
            $t->string('username', 64)->index();
            $t->string('result', 32);
            $t->string('ip', 64);
            $t->string('user_agent', 255)->default('');
            $t->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        foreach (['login_logs', 'audit_logs', 'settings', 'download_logs', 'upload_chunks', 'uploads', 'shares', 'files', 'folders', 'users'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
