import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ExternalLink, KeyRound, LogOut, Menu, Moon, Search, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import CommandMenu from './CommandMenu'
import Sidebar from './Sidebar'
import { ALL_ITEMS } from './nav'
import { useNavigate } from 'react-router-dom'

export default function AppLayout({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('drive-admin-sidebar') === '1' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const current = ALL_ITEMS.find((i) => (i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to)))

  const toggleCollapsed = () => setCollapsed((c) => {
    try { localStorage.setItem('drive-admin-sidebar', c ? '0' : '1') } catch { /* ignore */ }
    return !c
  })

  return (
    <div className="flex h-full">
      <div className="hidden h-full shrink-0 lg:block"><Sidebar collapsed={collapsed} onToggle={toggleCollapsed} /></div>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <DialogPrimitive.Title className="sr-only">导航菜单</DialogPrimitive.Title>
            <Sidebar collapsed={false} mobile onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}><Menu /></Button>
          <span className="truncate text-sm font-medium text-muted-foreground lg:hidden">{current?.label}</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-sm text-muted-foreground hover:bg-accent sm:w-64"
          >
            <Search className="h-4 w-4" />
            <span className="hidden flex-1 text-left sm:inline">搜索菜单和功能</span>
            <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
          </button>
          <Button variant="ghost" size="icon" onClick={toggle} title="切换主题">{theme === 'dark' ? <Sun /> : <Moon />}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold uppercase text-primary-foreground">
                {username.slice(0, 1)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{username}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => { window.location.href = '/' }}><ExternalLink />打开前台</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate('/account')}><KeyRound />修改密码</DropdownMenuItem>
              <DropdownMenuItem destructive onSelect={onLogout}><LogOut />退出登录</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-7xl"><Outlet /></div>
        </main>
      </div>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
