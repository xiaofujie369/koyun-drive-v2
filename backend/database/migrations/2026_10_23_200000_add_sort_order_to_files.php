<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('files', function (Blueprint $t) {
            // Manual order inside a folder: higher first, ties by name (same rule as folders.sort_order).
            $t->integer('sort_order')->default(0)->after('note');
            $t->index(['folder_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::table('files', function (Blueprint $t) {
            $t->dropIndex(['folder_id', 'sort_order']);
            $t->dropColumn('sort_order');
        });
    }
};
