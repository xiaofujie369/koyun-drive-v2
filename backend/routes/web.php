<?php

use App\Http\Controllers\Admin\ContentController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\SystemController;
use App\Http\Controllers\Admin\UserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DriveController;
use App\Http\Controllers\PublicController;
use App\Http\Controllers\ShareController;
use App\Http\Controllers\UploadController;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

// The single-page apps (/, /folder/{id}, /s/{token}, /drive, /admin, ...) are
// served by nginx; Laravel handles the API and the download endpoints.

// ---------------------------------------------------------------- chunk upload
// Session-less and CSRF-free: called cross-origin from the CDN domain to the
// upload domain and authorised by the per-upload X-Upload-Token header.
Route::put('kd/uploads/{id}/chunks/{index}', [UploadController::class, 'chunk'])
    ->whereUuid('id')->whereNumber('index')->middleware('throttle:chunks')
    ->withoutMiddleware([StartSession::class, ShareErrorsFromSession::class, ValidateCsrfToken::class, EncryptCookies::class, AddQueuedCookiesToResponse::class])
    ->name('uploads.chunk');

Route::prefix('kd')->group(function () {
    Route::middleware('throttle:public')->group(function () {
        Route::get('config', [PublicController::class, 'config'])->name('config');
        Route::get('public/home', [PublicController::class, 'home'])->name('public.home');
        Route::get('public/folders/{id}', [PublicController::class, 'folder'])->whereNumber('id')->name('public.folder');
        Route::get('public/search', [PublicController::class, 'search'])->name('public.search');
        Route::post('public/folders/{id}/unlock', [PublicController::class, 'unlockFolder'])->whereNumber('id')->name('public.folder.unlock');

        Route::get('s/{token}', [ShareController::class, 'show'])->name('share.show');
        Route::post('s/{token}/unlock', [ShareController::class, 'unlock'])->name('share.unlock');
        Route::get('s/{token}/browse', [ShareController::class, 'browse'])->name('share.browse');

        Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
        Route::post('auth/login', [AuthController::class, 'login'])->name('auth.login');
        Route::post('auth/register', [AuthController::class, 'register'])->name('auth.register');
        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    });

    Route::middleware(['auth.drive', 'throttle:user', 'audit'])->group(function () {
        Route::post('auth/password', [AuthController::class, 'changePassword'])->name('auth.password');

        Route::get('drive/list', [DriveController::class, 'list'])->name('drive.list');
        Route::get('drive/tree', [DriveController::class, 'tree'])->name('drive.tree');
        Route::get('drive/usage', [DriveController::class, 'usage'])->name('drive.usage');
        Route::post('drive/folders', [DriveController::class, 'createFolder'])->name('drive.folders.store');
        Route::patch('drive/folders/{id}', [DriveController::class, 'updateFolder'])->whereNumber('id')->name('drive.folders.update');
        Route::delete('drive/folders/{id}', [DriveController::class, 'deleteFolder'])->whereNumber('id')->name('drive.folders.destroy');
        Route::patch('drive/files/{id}', [DriveController::class, 'updateFile'])->whereNumber('id')->name('drive.files.update');
        Route::delete('drive/files/{id}', [DriveController::class, 'deleteFile'])->whereNumber('id')->name('drive.files.destroy');
        Route::get('drive/files/{id}/link', [DriveController::class, 'link'])->whereNumber('id')->name('drive.files.link');
        Route::post('drive/batch', [DriveController::class, 'batch'])->name('drive.batch');
        Route::post('drive/reorder', [DriveController::class, 'reorder'])->name('drive.reorder');

        Route::get('drive/shares', [ShareController::class, 'index'])->name('drive.shares.index');
        Route::post('drive/shares', [ShareController::class, 'store'])->name('drive.shares.store');
        Route::delete('drive/shares/{id}', [ShareController::class, 'destroy'])->whereNumber('id')->name('drive.shares.destroy');

        Route::post('uploads', [UploadController::class, 'init'])->name('uploads.init');
        Route::get('uploads/{id}', [UploadController::class, 'show'])->whereUuid('id')->name('uploads.show');
        Route::post('uploads/{id}/complete', [UploadController::class, 'complete'])->whereUuid('id')->name('uploads.complete');
        Route::delete('uploads/{id}', [UploadController::class, 'cancel'])->whereUuid('id')->name('uploads.cancel');
    });

    Route::prefix('admin')->name('admin.')->middleware(['admin', 'throttle:user', 'audit'])->group(function () {
        Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
        Route::get('dashboard/traffic', [DashboardController::class, 'traffic'])->name('dashboard.traffic');

        Route::get('users', [UserController::class, 'index'])->name('users.index');
        Route::post('users', [UserController::class, 'store'])->name('users.store');
        Route::patch('users/{id}', [UserController::class, 'update'])->whereNumber('id')->name('users.update');
        Route::post('users/{id}/password', [UserController::class, 'password'])->whereNumber('id')->name('users.password');
        Route::delete('users/{id}', [UserController::class, 'destroy'])->whereNumber('id')->name('users.destroy');

        Route::get('files', [ContentController::class, 'files'])->name('files.index');
        Route::get('folders', [ContentController::class, 'folders'])->name('folders.index');
        Route::get('shares', [ContentController::class, 'shares'])->name('shares.index');
        Route::get('uploads', [ContentController::class, 'uploads'])->name('uploads.index');
        Route::delete('uploads/{id}', [ContentController::class, 'destroyUpload'])->whereUuid('id')->name('uploads.destroy');
        Route::get('logs/downloads', [ContentController::class, 'downloads'])->name('logs.downloads');
        Route::get('logs/audit', [ContentController::class, 'audit'])->name('logs.audit');
        Route::get('logs/logins', [ContentController::class, 'logins'])->name('logs.logins');

        Route::get('settings', [SettingsController::class, 'show'])->name('settings.show');
        Route::put('settings', [SettingsController::class, 'update'])->name('settings.update');
        Route::get('system', [SystemController::class, 'status'])->name('system');
    });

    Route::any('{any}', fn () => abort(404, '接口不存在'))->where('any', '.*');
});

// ---------------------------------------------------------------- downloads
Route::get('d/{id}/{name?}', [PublicController::class, 'download'])->whereNumber('id')->middleware('throttle:downloads')->name('public.download');
Route::get('dl/{id}/{name?}', [DriveController::class, 'download'])->whereNumber('id')->middleware(['signed:relative', 'throttle:downloads'])->name('drive.download');
Route::get('s/{token}/file/{fileId}/{name?}', [ShareController::class, 'download'])->whereNumber('fileId')->middleware(['signed:relative', 'throttle:downloads'])->name('share.download');

// ---------------------------------------------------------------- old (v1) links
Route::get('public-download/{id}', fn (int $id) => redirect('/d/'.$id, 301))->whereNumber('id');
Route::get('s/{token}/download', [ShareController::class, 'legacyDownload']);
Route::get('folder/{name}', [PublicController::class, 'legacyFolder'])->where('name', '.*');
