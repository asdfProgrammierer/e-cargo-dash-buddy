import { Capacitor } from "@capacitor/core";

export interface GpsFix {
  lat: number;
  lng: number;
  acc: number;
}

/**
 * Best-effort GPS fix. On native Capacitor platforms (Android/iOS) uses the
 * @capacitor/geolocation plugin (which handles native permissions). In the
 * browser/PWA falls back to navigator.geolocation. Resolves to null on
 * timeout, permission denial or any error – never throws.
 */
export async function getCurrentGps(timeoutMs = 10000): Promise<GpsFix | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      try {
        const perm = await Geolocation.checkPermissions();
        if (perm.location !== "granted") {
          const req = await Geolocation.requestPermissions();
          if (req.location !== "granted") return null;
        }
      } catch {
        // some platforms don't support checkPermissions – try anyway
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 30000,
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy ?? 0,
      };
    }
  } catch (e) {
    console.warn("[gps] native geolocation failed", e);
    // fall through to browser API
  }

  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: GpsFix | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const t = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: pos.coords.accuracy,
        });
      },
      (err) => {
        console.warn("[gps] browser geolocation error", err);
        clearTimeout(t);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs - 1000, maximumAge: 30000 },
    );
  });
}