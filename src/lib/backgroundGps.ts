import { Capacitor } from "@capacitor/core";

/**
 * Starts a background location watcher on native platforms.
 *
 * Uses @capacitor-community/background-geolocation, which keeps a
 * foreground service alive on Android so the OS does not pause GPS
 * updates when the driver opens Google Maps / WhatsApp etc.
 *
 * The callback is throttled to at most one call per `minIntervalMs`
 * to keep the battery impact comparable to the foreground 60s ping.
 * Returns a stop function. No-op (returns null) in the browser/PWA –
 * there callers should keep using the foreground setInterval ping.
 */
export async function startBackgroundGpsWatcher(
  onFix: (fix: { lat: number; lng: number; acc: number }) => void,
  opts: { minIntervalMs?: number; distanceFilterM?: number; notificationTitle?: string; notificationText?: string } = {},
): Promise<(() => Promise<void>) | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const minInterval = opts.minIntervalMs ?? 60_000;
  const distance = opts.distanceFilterM ?? 25;

  let mod: typeof import("@capacitor-community/background-geolocation");
  try {
    mod = await import("@capacitor-community/background-geolocation");
  } catch (e) {
    console.warn("[bg-gps] plugin not available", e);
    return null;
  }
  const { BackgroundGeolocation } = mod;

  let lastSentAt = 0;
  let watcherId: string | null = null;
  try {
    watcherId = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: opts.notificationText ?? "Standort wird für die laufende Route übertragen.",
        backgroundTitle: opts.notificationTitle ?? "e-cargo · Route aktiv",
        requestPermissions: true,
        stale: false,
        distanceFilter: distance,
      },
      (location, error) => {
        if (error) {
          console.warn("[bg-gps] watcher error", error);
          return;
        }
        if (!location) return;
        const now = Date.now();
        if (now - lastSentAt < minInterval) return;
        lastSentAt = now;
        onFix({
          lat: location.latitude,
          lng: location.longitude,
          acc: location.accuracy ?? 0,
        });
      },
    );
  } catch (e) {
    console.warn("[bg-gps] addWatcher failed", e);
    return null;
  }

  return async () => {
    if (!watcherId) return;
    try {
      await BackgroundGeolocation.removeWatcher({ id: watcherId });
    } catch (e) {
      console.warn("[bg-gps] removeWatcher failed", e);
    }
  };
}