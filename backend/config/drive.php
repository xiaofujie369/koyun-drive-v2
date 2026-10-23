<?php

return [
    // Where finished files live (served by nginx via X-Accel-Redirect) and where
    // in-progress chunked uploads are assembled. Both must be on one filesystem
    // so completing an upload is a rename, not a copy.
    'files_path' => env('DRIVE_FILES_PATH', storage_path('drive/files')),
    'tmp_path' => env('DRIVE_TMP_PATH', storage_path('drive/tmp')),

    // nginx internal location that maps to files_path; empty = stream from PHP.
    'accel_prefix' => env('DRIVE_ACCEL_PREFIX', '/_protected_files/'),

    // Origins allowed to PUT upload chunks cross-origin (pan -> upload domain).
    'cors_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('DRIVE_CORS_ORIGINS', ''))))),

    // Defaults for settings editable in the admin panel.
    'defaults' => [
        'site_name' => env('DRIVE_SITE_NAME', 'Koyun Drive'),
        'site_subtitle' => '软件、资料与安装包下载中心',
        'announcement' => '',
        'upload_url' => env('DRIVE_UPLOAD_URL', ''),
        'chunk_size_mb' => 8,
        'max_file_size_gb' => 50,
        'default_quota_gb' => 20,
        'allow_register' => false,
        'user_public_folders' => false,
        'public_search' => true,
        'download_requires_login' => false,
        'share_default_days' => 0,
    ],
];
