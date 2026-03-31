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
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/clients', label: 'Clientes', icon: Users },
  { href: '/reports', label: 'Relatórios', icon: FileText },
  { href: '/metrics', label: 'Métricas', icon: BarChart3 },
]

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const pathname = usePathname()

  if (!user) return null // useAuth redireciona

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r bg-card flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b">
          <span className="text-lg font-bold text-foreground">XGO Midia</span>
          <p className="text-xs text-muted-foreground mt-0.5">Plataforma de Tráfego</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === href || pathname.startsWith(href + '/')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        {/* User info + logout */}
        <div className="px-3 py-4 border-t">
          <div className="flex items-center gap-3 px-3 py-2 rounded-md">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              {user.email[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{user.email}</p>
              <p className="text-xs text-muted-foreground">{user.role.replace('_', ' ')}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-1 flex w-full items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
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
