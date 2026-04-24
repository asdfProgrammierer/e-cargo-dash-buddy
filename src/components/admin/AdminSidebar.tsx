import { LayoutDashboard, Users, Leaf, LogOut, ArrowLeft, UserCircle, Truck, MapPin, Settings2 } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { useNavigate } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Übersicht", url: "/admin", icon: LayoutDashboard },
  { title: "Routenplanung", url: "/admin/routen", icon: MapPin },
  { title: "Händlerverwaltung", url: "/admin/haendler", icon: Users },
  { title: "Fahrer", url: "/admin/fahrer", icon: UserCircle },
  { title: "Fahrzeuge", url: "/admin/fahrzeuge", icon: Truck },
  { title: "Einstellungen", url: "/admin/einstellungen", icon: Settings2 },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive">
            <Leaf className="h-5 w-5 text-destructive-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-bold tracking-wide text-sidebar-foreground">e-cargo Admin</h2>
              <p className="text-[10px] uppercase tracking-widest text-sidebar-foreground/50">Verwaltung</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent/50"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-2">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
          {!collapsed && "Händler-Dashboard"}
        </Button>
        {!collapsed && user && (
          <p className="text-xs text-sidebar-foreground/60 truncate">{user.email}</p>
        )}
        <ThemeToggle collapsed={collapsed} />
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={signOut}
        >
          <LogOut className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
          {!collapsed && "Abmelden"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
