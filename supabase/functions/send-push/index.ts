import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@ecargo-logistik.de";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface RequestBody {
  // Either explicit user_ids, or audience selectors
  user_ids?: string[];
  audience?: "admins" | "all";
  payload: PushPayload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return json({ error: "VAPID keys not configured" }, 500);
  }

  try {
    const body = (await req.json()) as RequestBody;
    if (!body?.payload?.title) return json({ error: "payload.title required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let userIds: string[] = Array.isArray(body.user_ids) ? body.user_ids.filter(Boolean) : [];

    if (body.audience === "admins") {
      const { data: adminRows } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (adminRows ?? []).map((r: { user_id: string }) => r.user_id);
      userIds = Array.from(new Set([...userIds, ...adminIds]));
    }

    if (userIds.length === 0) {
      return json({ ok: true, sent: 0, note: "no recipients" });
    }

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", userIds);

    if (!subs || subs.length === 0) {
      return json({ ok: true, sent: 0, note: "no subscriptions" });
    }

    const payloadStr = JSON.stringify(body.payload);
    let sent = 0;
    const staleIds: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payloadStr,
          );
          sent += 1;
        } catch (e: unknown) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            staleIds.push(s.id);
          } else {
            console.error("push failed", s.endpoint, status, (e as Error).message);
          }
        }
      }),
    );

    if (staleIds.length > 0) {
      await admin.from("push_subscriptions").delete().in("id", staleIds);
    }

    return json({ ok: true, sent, removed: staleIds.length });
  } catch (e) {
    console.error("send-push error", e);
    return json({ error: (e as Error).message }, 500);
  }
});