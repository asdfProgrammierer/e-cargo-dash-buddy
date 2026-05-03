import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";

interface Notification {
  id: string;
  title: string;
  body: string;
  audience: string;
  target_user_id: string | null;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: notes }, { data: reads }] = await Promise.all([
      supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
      supabase.from("notification_reads").select("notification_id").eq("user_id", user.id),
    ]);
    setItems((notes ?? []) as Notification[]);
    setReadIds(new Set((reads ?? []).map((r: any) => r.notification_id)));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const unread = items.filter((n) => !readIds.has(n.id));

  const markAllRead = async () => {
    if (!user || unread.length === 0) return;
    const rows = unread.map((n) => ({ notification_id: n.id, user_id: user.id }));
    await supabase.from("notification_reads").upsert(rows, { onConflict: "notification_id,user_id" });
    setReadIds((prev) => {
      const next = new Set(prev);
      unread.forEach((n) => next.add(n.id));
      return next;
    });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void markAllRead();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Benachrichtigungen">
          <Bell className="h-4 w-4" />
          {unread.length > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-card" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b p-3">
          <p className="text-sm font-semibold">Benachrichtigungen</p>
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Keine Benachrichtigungen</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className="p-3">
                  <div className="flex items-start gap-2">
                    {!readIds.has(n.id) && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {new Date(n.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}