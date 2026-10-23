<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\DriveSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    public function __construct(private readonly DriveSettings $settings) {}

    public function show(): JsonResponse
    {
        return response()->json($this->settings->all());
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'site_name' => ['sometimes', 'string', 'max:60'],
            'site_subtitle' => ['sometimes', 'nullable', 'string', 'max:120'],
            'announcement' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'upload_url' => ['sometimes', 'nullable', 'string', 'max:200', 'regex:#^(https?://[A-Za-z0-9.\-]+(:\d+)?)?$#'],
            'chunk_size_mb' => ['sometimes', 'integer', 'min:1', 'max:32'],
            'max_file_size_gb' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'default_quota_gb' => ['sometimes', 'integer', 'min:0', 'max:1000000'],
            'allow_register' => ['sometimes', 'boolean'],
            'user_public_folders' => ['sometimes', 'boolean'],
            'public_search' => ['sometimes', 'boolean'],
            'download_requires_login' => ['sometimes', 'boolean'],
            'share_default_days' => ['sometimes', 'integer', 'min:0', 'max:3650'],
        ], ['upload_url.regex' => '上传域名格式应为 https://upload.example.com（不带路径）']);
        $this->settings->save($data);

        return response()->json($this->settings->all());
    }
}
