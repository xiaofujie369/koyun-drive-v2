import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, ChevronsLeft, ChevronsRight, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DASHBOARD, NAV, type NavItem } from './nav'

function Item({ item, collapsed, nested, onNavigate }: { item: NavItem; collapsed: boolean; nested?: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => cn(
        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
        isActive ? 'bg-accent text-foreground' : 'text-muted-foreground',
        nested && !collapsed && 'ml-3 border-l pl-4 rounded-l-none',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}

export default function Sidebar({ collapsed, onToggle, onNavigate, mobile }: {
  collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; mobile?: boolean
}) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  return (
    <aside className={cn('flex h-full flex-col border-r bg-card', mobile ? 'w-72' : collapsed ? 'w-16' : 'w-64')}>
      <div className={cn('flex h-16 items-center gap-2 border-b px-4 font-semibold', collapsed && !mobile && 'justify-center px-0')}>
        <HardDrive className="h-5 w-5 text-primary" />
        {(!collapsed || mobile) && <span className="truncate">网盘管理后台</span>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        <Item item={DASHBOARD} collapsed={collapsed && !mobile} onNavigate={onNavigate} />
        {NAV.map((group) => {
          const GroupIcon = group.icon
          const isClosed = closed[group.label]
          return (
            <div key={group.label} className="pt-3">
              {collapsed && !mobile ? <div className="mx-auto my-1 h-px w-6 bg-border" /> : (
                <button
                  type="button"
                  onClick={() => setClosed((c) => ({ ...c, [group.label]: !c[group.label] }))}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-sm font-semibold"
                >
                  <GroupIcon className="h-4 w-4" />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isClosed && '-rotate-90')} />
                </button>
              )}
              {!isClosed && (
                <div className="mt-1 space-y-0.5">
                  {group.items.map((item) => <Item key={item.to} item={item} nested collapsed={collapsed && !mobile} onNavigate={onNavigate} />)}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      {onToggle && !mobile && (
        <button type="button" onClick={onToggle} className="flex h-11 items-center justify-center gap-2 border-t text-sm text-muted-foreground hover:bg-accent">
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" />收起菜单</>}
        </button>
      )}
    </aside>
  )
}
