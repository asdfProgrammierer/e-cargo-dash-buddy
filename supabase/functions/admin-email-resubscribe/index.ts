import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { setEmailUnsubscribe } from "npm:@lovable.dev/email-js@0.4.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Admin-only: lifts a recipient's unsubscribe after renewed consent.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (d: unknown, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);
    const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await uc.auth.getUser();
    if (!u.user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await uc.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const { recipient } = await req.json();
    if (typeof recipient !== "string" || !recipient.includes("@")) return json({ error: "recipient fehlt" }, 400);
    const res = await setEmailUnsubscribe(
      { recipient, domain: "ecargo-logistic.de", subscribed: true },
      { apiKey: Deno.env.get("LOVABLE_API_KEY")! },
    );
    return json(res);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
