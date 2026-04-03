'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  BarChart3,
  FileText,
  LogOut,
  Loader2,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/reports', label: 'Relatórios', icon: FileText },
  { href: '/metrics', label: 'Métricas', icon: BarChart3 },
]

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, isInitializing } = useAuth()
  const pathname = usePathname()

  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return null

  const initials = user.email[0]?.toUpperCase() ?? '?'

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar — dark stone-950 */}
      <aside className="w-64 flex-shrink-0 flex flex-col" style={{ backgroundColor: '#0C0A09' }}>

        {/* Logo */}
        <div className="px-6 py-6 border-b border-stone-800">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-xl font-bold text-white tracking-tight">XGO</span>
            <span style={{ color: '#C8432A' }} className="text-xl font-bold">·</span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5 tracking-wide">Midia Platform</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'text-white'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800',
                )}
                style={isActive ? { backgroundColor: '#C8432A' } : undefined}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div className="px-3 py-4 border-t border-stone-800">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ backgroundColor: '#C8432A' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-stone-200 truncate">{user.email}</p>
              <p className="text-[11px] text-stone-500">{user.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-1 flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-500 hover:text-stone-300 hover:bg-stone-800 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
