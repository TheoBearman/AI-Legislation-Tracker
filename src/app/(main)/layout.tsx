"use client"
import { Gavel, LayoutDashboard, Newspaper, Users, Wrench, type LucideIcon } from "lucide-react";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { StatePulseHeader } from "@/components/StatePulseHeader";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarFooter,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { StatePulseFooter } from "@/components/StatePulseFooter";

type ActiveView =
  | "home"
  | "dashboard"
  | "updates"
  | "representatives"


interface MenuItem {
  id: ActiveView;
  path: string;
  label: string;
  icon: LucideIcon;
}

const menuItems: MenuItem[] = [
  { id: "home", path: "/", label: "Home", icon: Gavel },
  { id: "dashboard", path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "updates", path: "/legislation", label: "Legislation", icon: Newspaper },
  { id: "representatives", path: "/representatives", label: "Representatives", icon: Users },

];

function SidebarContentWithAutoClose() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleMenuItemClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <SidebarContent>
      <SidebarMenu>
        {menuItems.map((item) => (
          <SidebarMenuItem key={item.id}>
            <Link href={item.path} onClick={handleMenuItemClick}>
              <SidebarMenuButton
                isActive={pathname === item.path}
                tooltip={item.label}
                className="justify-start"
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </SidebarMenuButton>
            </Link>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarContent>
  );
}

export default function MainAppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider defaultOpen>
      <Sidebar>
        <SidebarHeader className="p-4">
          <div className="flex items-center gap-2">
            <Gavel className="h-7 w-7 text-sidebar-primary" />
            <h2 className="text-xl font-semibold font-headline text-sidebar-foreground">
              AI Legislation Tracker
            </h2>
          </div>
        </SidebarHeader>
        <SidebarContentWithAutoClose />
        <SidebarFooter className="p-4 flex flex-col gap-3">
          <div className="flex flex-row items-center w-full gap-2 mb-2">
            {/* Donation button removed */}
          </div>
          <SidebarSeparator className="my-2" />
          <p className="text-xs text-sidebar-foreground/70 text-center">
            © {new Date().getFullYear()} AI Legislation Tracker
          </p>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <StatePulseHeader />
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6 bg-background">
          {children}
        </main>
        <StatePulseFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
