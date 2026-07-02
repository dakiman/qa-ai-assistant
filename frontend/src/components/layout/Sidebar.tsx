'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Box, Plus, LayoutTemplate, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApiHealth } from '@/lib/queries';

const navigation = [
  {
    name: 'Dashboard',
    href: '/',
    icon: Home,
  },
  {
    name: 'Features',
    href: '/features',
    icon: Box,
  },
  {
    name: 'New Feature',
    href: '/features/new',
    icon: Plus,
  },
  {
    name: 'Templates',
    href: '/templates',
    icon: LayoutTemplate,
  },
];

interface SidebarContentsProps {
  onNavigate?: () => void;
}

export function SidebarContents({ onNavigate }: SidebarContentsProps = {}) {
  const pathname = usePathname();
  const health = useApiHealth();

  // Only the single best-matching (longest-prefix) nav item is active, so
  // /features/new no longer lights up both "Features" and "New Feature" (L24).
  const activeHref = navigation
    .filter((item) =>
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(item.href + '/')
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary glow-teal">
          <CheckCircle2 className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold text-lg tracking-tight text-sidebar-foreground">QA-Craft</h1>
          <p className="text-xs text-muted-foreground">Test Management</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-4">
        <p className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Navigation
        </p>
        {navigation.map((item) => {
          const isActive = item.href === activeHref;
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-primary'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'text-primary')} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer — reflects a real connectivity probe (L24) */}
      <div className="mt-auto border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent/30 px-3 py-2">
          {(() => {
            const { dot, label } = health.isLoading
              ? { dot: 'bg-amber-500 animate-pulse', label: 'Checking API…' }
              : health.data
                ? { dot: 'bg-green-500 animate-pulse', label: 'API Connected' }
                : { dot: 'bg-red-500', label: 'API Unreachable' };
            return (
              <>
                <div className={cn('h-2 w-2 rounded-full', dot)} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden md:block fixed left-0 top-0 z-40 h-screen w-64 border-r border-sidebar-border bg-sidebar">
      <SidebarContents />
    </aside>
  );
}
