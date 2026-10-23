import {
  CloudUpload, FileClock, FolderTree, Files, HardDrive, LayoutDashboard, LogIn, type LucideIcon, Download,
  Server, Settings, Share2, Users, KeyRound,
} from 'lucide-react'

export interface NavItem { to: string; label: string; icon: LucideIcon; keywords?: string }
export interface NavGroup { label: string; icon: LucideIcon; items: NavItem[] }

export const DASHBOARD: NavItem = { to: '/', label: '仪表盘', icon: LayoutDashboard, keywords: 'dashboard overview' }

export const NAV: NavGroup[] = [
  {
    label: '文件管理', icon: HardDrive, items: [
      { to: '/browser', label: '文件浏览与上传', icon: FolderTree, keywords: 'upload folder browse 上传' },
      { to: '/files', label: '全部文件', icon: Files, keywords: 'files search' },
      { to: '/shares', label: '分享管理', icon: Share2, keywords: 'share link' },
      { to: '/uploads', label: '上传任务', icon: CloudUpload, keywords: 'upload sessions chunks' },
    ],
  },
  {
    label: '用户与日志', icon: Users, items: [
      { to: '/users', label: '用户管理', icon: Users, keywords: 'users accounts quota' },
      { to: '/logs/downloads', label: '下载记录', icon: Download, keywords: 'download log' },
      { to: '/logs/audit', label: '操作审计', icon: FileClock, keywords: 'audit log' },
      { to: '/logs/logins', label: '登录记录', icon: LogIn, keywords: 'login history' },
    ],
  },
  {
    label: '系统管理', icon: Settings, items: [
      { to: '/settings', label: '系统设置', icon: Settings, keywords: 'settings config upload domain' },
      { to: '/system', label: '系统状态', icon: Server, keywords: 'status health version disk' },
      { to: '/account', label: '修改密码', icon: KeyRound, keywords: 'password account' },
    ],
  },
]

export const ALL_ITEMS: NavItem[] = [DASHBOARD, ...NAV.flatMap((g) => g.items)]
