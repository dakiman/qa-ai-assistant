'use client';

import { Sidebar } from './Sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen gradient-bg">
      <Sidebar />
      <main className="ml-64 min-h-screen">
        <ScrollArea className="h-screen">
          <div className="p-8">
            {children}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

