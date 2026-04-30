// Robuste Bestimmung der öffentlichen Kundendomain für Tracking-Links in E-Mails.
//
// Reihenfolge:
// 1. Secret PUBLIC_SITE_URL (kanonische Override)
// 2. Request Origin/Referer Header — nur wenn es sich um eine Produktionsdomain
//    handelt (NICHT localhost, NICHT *.lovable.app / *.lovable.dev / *.lovableproject.com)
// 3. Fallback DEFAULT_SITE_URL
//
// Edge Functions werden von Cron, Drivern und Admin-UIs aufgerufen — der Origin-
// Header zeigt dann oft auf die Lovable-Preview, nicht auf die Kundendomain.
// Deshalb wird die Lovable-Preview hier explizit verworfen.

const DEFAULT_SITE_URL = "https://ecargo-logistic.de";

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
    // Strip path / search / hash — wir wollen nur den Origin
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Liefert die Origin (z.B. "https://ecargo-logistic.de") für Tracking-Links.
 * Nimmt optional den Request entgegen, um Origin/Referer als Quelle zu nutzen.
 */
export function getPublicSiteUrl(req?: Request): string {
  // 1. Secret-Override gewinnt immer
  const override = normalize(Deno.env.get("PUBLIC_SITE_URL"));
  if (override) return override;

  // 2. Request-Header prüfen, aber Lovable-Previews/Localhost ablehnen
  if (req) {
    const candidates = [req.headers.get("origin"), req.headers.get("referer")];
    for (const c of candidates) {
      const normalized = normalize(c);
      if (!normalized) continue;
      try {
        const host = new URL(normalized).hostname;
        if (!isPreviewHost(host)) return normalized;
      } catch {
        // ignore
      }
    }
  }

  // 3. Fallback auf die bekannte Kundendomain
  return DEFAULT_SITE_URL;
}

/**
 * Baut eine vollständige Tracking-URL für einen Tracking-Token.
 * Gibt einen leeren String zurück, wenn kein Token vorhanden ist.
 */
export function buildTrackingUrl(token: string | null | undefined, req?: Request): string {
  if (!token) return "";
  return `${getPublicSiteUrl(req)}/track/${token}`;
}
