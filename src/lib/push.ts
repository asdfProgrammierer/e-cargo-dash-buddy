import { supabase } from "@/integrations/supabase/client";

// VAPID public key — safe to expose in frontend code (publishable).
export const VAPID_PUBLIC_KEY =
  "BBIntGA3q9kuy9NSkoh1MxV_SodOf3NsmKYs52GIbwro9L-9WDDONZan0COctoKWIwFkQY2xQDAcIt2HvMhGmxI";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) output[i] = rawData.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  return Notification.permission;
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { ok: false, error: "Push wird vom Browser nicht unterstützt" };
  }
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Nicht angemeldet" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, error: "Berechtigung verweigert" };
  }

  let reg: ServiceWorkerRegistration;
  try {
    reg = await ensureRegistration();
    await navigator.serviceWorker.ready;
  } catch (e) {
    return { ok: false, error: "Service Worker konnte nicht registriert werden" };
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    } catch (e) {
      return { ok: false, error: "Push-Subscription fehlgeschlagen" };
    }
  }

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  const endpoint = json.endpoint ?? sub.endpoint;
  const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(sub.getKey("p256dh"));
  const auth = json.keys?.auth ?? arrayBufferToBase64(sub.getKey("auth"));

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userData.user.id,
        endpoint,
        p256dh,
        auth,
        platform: "web",
        user_agent: navigator.userAgent.slice(0, 200),
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disablePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: true };
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => {});
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function isPushActive(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    return !!sub && Notification.permission === "granted";
  } catch {
    return false;
  }
}