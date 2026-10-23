import axios, { AxiosError } from 'axios'

export interface UserInfo { id: number; username: string; is_admin: boolean; quota: number; used: number }
export interface SiteConfig {
  site_name: string; site_subtitle: string; announcement: string; upload_url: string
  chunk_size: number; max_file_size: number; allow_register: boolean; public_search: boolean
  user_public_folders: boolean; download_requires_login: boolean; user: UserInfo | null
}
export interface PublicFolderCard { id: number; name: string; description: string; files: number; size: number; downloads: number; subfolders: number; updated_at: string | null; locked: boolean }
export interface PublicFile { id: number; name: string; size: number; mime_type: string; note: string; downloads: number; created_at: string; url: string; preview: boolean; folder?: { id: number; name: string } }
export interface Crumb { id: number; name: string }
export interface PublicFolderPage {
  folder: { id: number; name: string; description: string }; breadcrumbs: Crumb[]; locked: boolean
  lock?: { id: number; name: string; is_self: boolean }
  folders?: { id: number; name: string; description: string; files: number; locked: boolean }[]; files?: PublicFile[]
}
export interface DriveFolder { id: number; name: string; parent_id: number | null; owner_id: number; description: string; is_public: boolean; access_password: string | null; sort_order: number; files?: number; size?: number; created_at: string; updated_at: string }
export interface DriveFile { id: number; name: string; size: number; mime_type: string; note: string; folder_id: number | null; owner_id: number; downloads: number; preview: boolean; created_at: string; updated_at: string }
export interface ShareRow { id: number; token: string; type: 'file' | 'folder'; name: string; password: string | null; expires_at: string | null; max_downloads: number | null; download_count: number; view_count: number; created_at: string; status: 'active' | 'invalid'; status_text: string | null }
export interface ShareFile { id: number; name: string; size: number; mime_type: string; note: string; created_at: string; url: string; preview_url: string | null }
export interface ShareInfo { token: string; type: 'file' | 'folder'; name: string; owner: string; created_at: string; expires_at: string | null; locked: boolean; file?: ShareFile }
export interface TreeFolder { id: number; name: string; parent_id: number | null; is_public: boolean; owner_id: number; owner: string }

// Laravel sets the XSRF-TOKEN cookie; axios echoes it back as X-XSRF-TOKEN.
const http = axios.create({ baseURL: '/kd', headers: { Accept: 'application/json' } })

export function errorMessage(err: unknown): string {
  const e = err as AxiosError<{ error?: string }>
  return e.response?.data?.error ?? (e.response ? `请求失败 (${e.response.status})` : '网络错误，请检查网络后重试')
}

const d = <T>(p: Promise<{ data: T }>) => p.then((r) => r.data)

export const api = {
  config: () => d(http.get<SiteConfig>('/config')),
  home: () => d(http.get<{ folders: PublicFolderCard[]; stats: { folders: number; files: number; size: number; downloads: number } }>('/public/home')),
  publicFolder: (id: number) => d(http.get<PublicFolderPage>(`/public/folders/${id}`)),
  unlockFolder: (id: number, password: string) => d(http.post<{ ok: boolean; locked: boolean }>(`/public/folders/${id}/unlock`, { password })),
  search: (q: string) => d(http.get<{ files: PublicFile[] }>('/public/search', { params: { q } })),

  login: (username: string, password: string) => d(http.post<{ user: UserInfo }>('/auth/login', { username, password })),
  register: (username: string, password: string) => d(http.post<{ user: UserInfo }>('/auth/register', { username, password })),
  logout: () => d(http.post('/auth/logout')),
  me: () => d(http.get<{ user: UserInfo | null }>('/auth/me')),
  changePassword: (current_password: string, new_password: string) => d(http.post('/auth/password', { current_password, new_password })),

  list: (folderId: number | null) => d(http.get<{ folder: DriveFolder | null; breadcrumbs: Crumb[]; folders: DriveFolder[]; files: DriveFile[] }>('/drive/list', { params: { folder_id: folderId ?? undefined } })),
  tree: () => d(http.get<{ folders: TreeFolder[] }>('/drive/tree')).then((r) => r.folders),
  usage: () => d(http.get<{ used: number; quota: number; files: number; folders: number }>('/drive/usage')),
  createFolder: (body: { name: string; parent_id: number | null; is_public?: boolean }) => d(http.post<{ folder: DriveFolder }>('/drive/folders', body)),
  updateFolder: (id: number, body: Partial<{ name: string; parent_id: number | null; is_public: boolean; description: string; access_password: string | null }>) => d(http.patch(`/drive/folders/${id}`, body)),
  deleteFolder: (id: number) => d(http.delete<{ files: number; folders: number }>(`/drive/folders/${id}`)),
  updateFile: (id: number, body: Partial<{ name: string; folder_id: number | null; note: string }>) => d(http.patch(`/drive/files/${id}`, body)),
  deleteFile: (id: number) => d(http.delete(`/drive/files/${id}`)),
  batch: (body: { action: 'move' | 'delete'; file_ids: number[]; folder_ids: number[]; target_id?: number | null }) => d(http.post<{ files: number; folders: number }>('/drive/batch', body)),
  reorder: (body: { folder_ids: number[]; file_ids: number[] }) => d(http.post<{ folders: number; files: number }>('/drive/reorder', body)),
  fileLink: (id: number) => d(http.get<{ url: string; preview_url: string | null }>(`/drive/files/${id}/link`)),

  shares: () => d(http.get<{ shares: ShareRow[] }>('/drive/shares')).then((r) => r.shares),
  createShare: (body: { file_id?: number; folder_id?: number; password?: string; expires_days?: number; max_downloads?: number }) => d(http.post<{ share: ShareRow }>('/drive/shares', body)).then((r) => r.share),
  deleteShare: (id: number) => d(http.delete(`/drive/shares/${id}`)),

  share: (token: string) => d(http.get<ShareInfo>(`/s/${encodeURIComponent(token)}`)),
  unlockShare: (token: string, password: string) => d(http.post(`/s/${encodeURIComponent(token)}/unlock`, { password })),
  browseShare: (token: string, folderId?: number) => d(http.get<{ breadcrumbs: Crumb[]; folders: { id: number; name: string }[]; files: ShareFile[] }>(`/s/${encodeURIComponent(token)}/browse`, { params: { folder_id: folderId } })),
}
