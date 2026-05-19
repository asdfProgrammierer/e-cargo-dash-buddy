// Robuste Bestimmung der öffentlichen Kundendomain für Tracking-Links.
//
// Reihenfolge:
// 1. VITE_PUBLIC_SITE_URL (Build-Zeit-Override, falls gesetzt)
// 2. window.location.origin — wenn es sich um eine echte Produktionsdomain
//    handelt (NICHT localhost, NICHT *.lovable.app / *.lovable.dev / -preview)
// 3. Fallback DEFAULT_SITE_URL (Kundendomain)
//
// Wird genutzt, wenn das Frontend Tracking-URLs in E-Mail-Templates injiziert
// (z.B. Admin-Test-Versand). Ohne diese Logik landen Test-Mails mit
// id-preview--*.lovable.app-Links beim Endkunden.

const DEFAULT_SITE_URL = "https://ecargo-connect.ecargo-logistik.de";

const PREVIEW_HOST_SUFFIXES = [
  ".lovable.app",
  ".lovable.dev",
  ".lovableproject.com",
  ".lovable.cloud",
];

function isPreviewHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.startsWith("127.") || h.startsWith("0.0.0.0")) return true;
  return PREVIEW_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

function normalize(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function getPublicSiteUrl(): string {
  const envOverride = normalize((import.meta as any).env?.VITE_PUBLIC_SITE_URL);
  if (envOverride) return envOverride;

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = normalize(window.location.origin);
    if (origin) {
      try {
        const host = new URL(origin).hostname;
        if (!isPreviewHost(host)) return origin;
      } catch {
        // ignore
      }
    }
  }

  return DEFAULT_SITE_URL;
}

export function buildTrackingUrl(token: string | null | undefined): string {
  if (!token) return "";
  return `${getPublicSiteUrl()}/track/${token}`;
}
