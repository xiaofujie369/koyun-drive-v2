import axios, { AxiosError } from 'axios'

// ------------------------------------------------------------ types

export interface Me { id: number; username: string; is_admin: boolean; quota: number; used: number }
export interface Page<T> { data: T[]; total: number; page: number; per_page: number }

export interface AdminUser {
  id: number; username: string; is_admin: boolean; is_active: boolean; quota_bytes: number | null; effective_quota: number
  files: number; used: number; last_login_at: string | null; last_login_ip: string | null; created_at: string
}
export interface FolderRow {
  id: number; name: string; parent_id: number | null; owner_id: number; owner: string; description: string
  is_public: boolean; sort_order: number; files: number; size: number; downloads: number; created_at: string
}
export interface DriveFolder { id: number; name: string; parent_id: number | null; owner_id: number; description: string; is_public: boolean; sort_order: number; files?: number; size?: number; created_at: string; updated_at: string }
export interface DriveFile {
  id: number; name: string; size: number; mime_type: string; note: string; folder_id: number | null; owner_id: number
  downloads: number; preview: boolean; created_at: string; updated_at: string; owner?: string; folder?: string | null
}
export interface Listing { owner: { id: number; username: string } | null; folder: DriveFolder | null; breadcrumbs: { id: number; name: string }[]; folders: DriveFolder[]; files: DriveFile[] }
export interface ShareRow {
  id: number; token: string; type: 'file' | 'folder'; name: string; password: string | null; expires_at: string | null
  max_downloads: number | null; download_count: number; view_count: number; created_at: string; owner: string
  status: 'active' | 'invalid'; status_text: string | null
}
export interface UploadRow { id: string; name: string; size: number; user: string; received_chunks: number; total_chunks: number; status: string; created_at: string; updated_at: string }
export interface DownloadEntry { id: number; file_id: number; file_name: string; share_id: number | null; user_id: number | null; via: string; size: number; ip: string; user_agent: string; created_at: string }
export interface AuditEntry { id: number; username: string; action: string; target: string | null; details: Record<string, unknown> | null; success: boolean; ip: string; user_agent: string; created_at: string }
export interface LoginEntry { id: number; username: string; result: string; ip: string; user_agent: string; created_at: string }

export interface Dashboard {
  users: { total: number; active: number; admins: number }
  files: { total: number; size: number; today: number; folders: number; public_folders: number }
  downloads: { total: number; today: number; yesterday: number; week: number; bytes_today: number }
  shares: { total: number; active: number }
  uploads: { active: number; pending_bytes: number }
  disk: { total: number; free: number }
  top_files: { id: number; name: string; size: number; download_count: number }[]
  recent_files: { id: number; name: string; size: number; created_at: string; owner: { username: string } | null }[]
}
export interface TrafficPoint { day: string; downloads: number; download_bytes: number; uploads: number; upload_bytes: number }

export interface Settings {
  site_name: string; site_subtitle: string; announcement: string; upload_url: string
  chunk_size_mb: number; max_file_size_gb: number; default_quota_gb: number
  allow_register: boolean; user_public_folders: boolean; public_search: boolean; download_requires_login: boolean; share_default_days: number
}
export interface SiteConfig { site_name: string; public_url: string; upload_url: string; chunk_size: number; max_file_size: number }

export interface SystemStatus {
  services: Record<string, { ok: boolean; ms?: number; version?: string; error?: string }>
  versions: Record<string, string | null>
  storage: { path: string; disk_total: number; disk_free: number; tmp_bytes: number; tmp_path: string }
  php: { memory_usage: number; memory_limit: string }
  server_time: string
}

// ------------------------------------------------------------ client

// Laravel session + CSRF: axios sends the XSRF-TOKEN cookie back as X-XSRF-TOKEN.
export const http = axios.create({ baseURL: '/kd', headers: { Accept: 'application/json' } })

let onUnauthorized: (message?: string) => void = () => {}
export function setAuthHandlers(h: { unauthorized: (m?: string) => void }) {
  onUnauthorized = h.unauthorized
}

http.interceptors.response.use(undefined, (err: AxiosError<{ error?: string }>) => {
  const url = err.config?.url ?? ''
  if ((err.response?.status === 401 || err.response?.status === 403) && url.startsWith('/admin/')) onUnauthorized(err.response?.data?.error)
  if (err.response?.status === 401 && !url.startsWith('/auth/')) onUnauthorized(err.response?.data?.error)
  return Promise.reject(err)
})

export function errorMessage(err: unknown): string {
  if (err instanceof Error && !(err as AxiosError).isAxiosError) return err.message
  const e = err as AxiosError<{ error?: string }>
  return e.response?.data?.error ?? (e.response ? `请求失败 (${e.response.status})` : '网络错误，请检查连接')
}

const data = <T,>(p: Promise<{ data: T }>) => p.then((r) => r.data)
type Params = Record<string, string | number | undefined>

export const api = {
  // auth
  me: () => data(http.get<{ user: Me | null }>('/auth/me')).then((r) => r.user),
  login: (username: string, password: string) => data(http.post<{ user: Me }>('/auth/login', { username, password })).then((r) => r.user),
  logout: () => data(http.post('/auth/logout')),
  changePassword: (current_password: string, new_password: string) => data(http.post('/auth/password', { current_password, new_password })),
  config: () => data(http.get<SiteConfig>('/config')),
  // dashboard & system
  dashboard: () => data(http.get<Dashboard>('/admin/dashboard')),
  traffic: (days: number) => data(http.get<{ series: TrafficPoint[] }>('/admin/dashboard/traffic', { params: { days } })).then((r) => r.series),
  system: () => data(http.get<SystemStatus>('/admin/system')),
  settings: () => data(http.get<Settings>('/admin/settings')),
  saveSettings: (body: Partial<Settings>) => data(http.put<Settings>('/admin/settings', body)),
  // users
  users: (params: Params) => data(http.get<Page<AdminUser>>('/admin/users', { params })),
  createUser: (body: { username: string; password: string; is_admin: boolean; quota_gb: number | null }) => data(http.post('/admin/users', body)),
  updateUser: (id: number, body: Partial<{ username: string; is_admin: boolean; is_active: boolean; quota_gb: number | null }>) => data(http.patch(`/admin/users/${id}`, body)),
  resetPassword: (id: number, password: string) => data(http.post(`/admin/users/${id}/password`, { password })),
  deleteUser: (id: number, purge: boolean) => data(http.delete(`/admin/users/${id}`, { params: { purge: purge ? 1 : 0 } })),
  // content (global)
  files: (params: Params) => data(http.get<Page<DriveFile>>('/admin/files', { params })),
  folders: () => data(http.get<{ folders: FolderRow[] }>('/admin/folders')).then((r) => r.folders),
  shares: (params: Params) => data(http.get<Page<ShareRow>>('/admin/shares', { params })),
  uploads: () => data(http.get<{ uploads: UploadRow[] }>('/admin/uploads')).then((r) => r.uploads),
  deleteUpload: (id: string) => data(http.delete(`/admin/uploads/${id}`)),
  downloadLogs: (params: Params) => data(http.get<Page<DownloadEntry>>('/admin/logs/downloads', { params })),
  audit: (params: Params) => data(http.get<Page<AuditEntry>>('/admin/logs/audit', { params })),
  logins: (params: Params) => data(http.get<Page<LoginEntry>>('/admin/logs/logins', { params })),
  // drive operations (admins may act on any owner's items)
  list: (params: { folder_id?: number | null; owner_id?: number }) => data(http.get<Listing>('/drive/list', { params: { folder_id: params.folder_id ?? undefined, owner_id: params.owner_id } })),
  createFolder: (body: { name: string; parent_id: number | null; is_public?: boolean; description?: string; owner_id?: number }) => data(http.post<{ folder: DriveFolder }>('/drive/folders', body)),
  updateFolder: (id: number, body: Partial<{ name: string; parent_id: number | null; is_public: boolean; description: string; sort_order: number }>) => data(http.patch(`/drive/folders/${id}`, body)),
  deleteFolder: (id: number) => data(http.delete<{ files: number; folders: number }>(`/drive/folders/${id}`)),
  updateFile: (id: number, body: Partial<{ name: string; folder_id: number | null; note: string }>) => data(http.patch(`/drive/files/${id}`, body)),
  batch: (body: { action: 'move' | 'delete'; file_ids: number[]; folder_ids: number[]; target_id?: number | null }) => data(http.post<{ files: number; folders: number }>('/drive/batch', body)),
  fileLink: (id: number) => data(http.get<{ url: string; preview_url: string | null }>(`/drive/files/${id}/link`)),
  createShare: (body: { file_id?: number; folder_id?: number; password?: string; expires_days?: number; max_downloads?: number }) => data(http.post<{ share: ShareRow }>('/drive/shares', body)).then((r) => r.share),
  deleteShare: (id: number) => data(http.delete(`/drive/shares/${id}`)),
}
