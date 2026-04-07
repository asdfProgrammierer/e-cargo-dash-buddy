import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

export function ThemeToggle({ collapsed }: { collapsed?: boolean }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDark(true);
    else if (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) setDark(true);
  }, []);

  return (
    <Button
      variant="ghost"
      size={collapsed ? "icon" : "sm"}
      className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
      onClick={() => setDark(!dark)}
    >
      {dark ? (
        <Sun className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
      ) : (
        <Moon className={collapsed ? "h-4 w-4" : "mr-2 h-4 w-4"} />
      )}
      {!collapsed && (dark ? "Light Mode" : "Dark Mode")}
    </Button>
  );
}
