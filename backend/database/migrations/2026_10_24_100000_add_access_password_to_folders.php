<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('folders', function (Blueprint $t) {
            // Visitor access code for a public folder (and everything below it); null = open.
            // Stored like share extraction codes so owners can look it up and pass it on.
            $t->string('access_password', 64)->nullable()->after('is_public');
        });
    }

    public function down(): void
    {
        Schema::table('folders', function (Blueprint $t) {
            $t->dropColumn('access_password');
        });
    }
};
