<?php

// Only the chunk endpoint is called cross-origin (the user frontend on the CDN
// domain sends chunks straight to the upload domain). It authenticates with a
// per-upload token header, never cookies, so credentials stay disabled.
// The API lives under /kd/ because the Cloudflare zone blocks paths starting with /api.
return [
    'paths' => ['kd/uploads/*/chunks/*'],
    'allowed_methods' => ['PUT', 'OPTIONS'],
    'allowed_origins' => array_values(array_filter(array_map('trim', explode(',', (string) env('DRIVE_CORS_ORIGINS', ''))))),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['Content-Type', 'X-Upload-Token', 'Accept'],
    'exposed_headers' => [],
    'max_age' => 86400,
    'supports_credentials' => false,
];
