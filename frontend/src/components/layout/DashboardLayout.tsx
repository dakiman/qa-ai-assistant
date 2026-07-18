'use client';

import { useState } from 'react';
import { Menu, CheckCircle2 } from 'lucide-react';
import { Sidebar, SidebarContents } from './Sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  // SidebarContents calls onNavigate on every nav-link click which closes
  // the drawer; that handles the common case without a setState-in-effect
  // pattern (rejected by react-hooks/set-state-in-effect).
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen gradient-bg">
      <Sidebar />

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/95 backdrop-blur px-4">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 bg-sidebar">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <SidebarContents onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>

        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
            <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight text-sidebar-foreground">QA-Craft</span>
        </div>
      </header>

      <main className="md:ml-64 min-h-screen">
        {/* Below the 56px mobile header the viewport is already short by that
            much; a full h-screen ScrollArea here creates a second, nested
            scroll container that double-scrolls on mobile (B5). */}
        <ScrollArea className="h-[calc(100vh-3.5rem)] md:h-screen">
          <div className="p-4 md:p-8">
            {children}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
