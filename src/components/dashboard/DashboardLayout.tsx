import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { BerlinClock } from "@/components/dashboard/BerlinClock";
import { NotificationBell } from "@/components/NotificationBell";
import { PushToggle } from "@/components/PushToggle";

interface DashboardLayoutProps {
  title: string;
  children: ReactNode;
}

export function DashboardLayout({ title, children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="flex h-14 items-center justify-between border-b border-border/50 bg-card px-3 sm:px-6 gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <SidebarTrigger />
              <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <PushToggle compact />
              <NotificationBell />
              <div className="hidden sm:block">
                <BerlinClock />
              </div>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-6 min-w-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
