// Offline-Warteschlange für Zustell-Bestätigungen der Fahrer-App.
// Jede Bestätigung (Status, Foto, Unterschrift, Notiz, GPS, Zeitpunkt) wird
// zuerst lokal in IndexedDB gesichert und dann im Hintergrund übertragen.
// Bei Netzabbruch bleibt sie gespeichert und wird automatisch nachgesendet.
import { supabase } from "@/integrations/supabase/client";
import { FunctionsFetchError, FunctionsRelayError, FunctionsHttpError } from "@supabase/supabase-js";

export interface QueuedDelivery {
  id: string; // = stop_id (ein Eintrag pro Stopp)
  routeId: string;
  createdAt: string; // Zeitpunkt der Bestätigung auf dem Gerät
  attempts: number;
  lastError?: string;
  body: {
    stop_id: string;
    status: "erledigt" | "uebersprungen";
    reason?: string;
    delivery_mode?: string;
    delivery_note?: string;
    delivery_recipient?: string;
    signature_base64?: string | null;
    photo_base64?: string | null;
    completed_lat?: number;
    completed_lng?: number;
    completed_accuracy_m?: number | null;
  };
}

export interface SyncResult {
  item: QueuedDelivery;
  data: { route_completed?: boolean; end_depot?: unknown } | null;
}

export type SyncState = { pending: number; syncing: boolean; online: boolean; lastError?: string };

const DB_NAME = "ecargo-driver";
const STORE = "delivery-queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const listQueued = () => tx<QueuedDelivery[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedDelivery[]>);
const putQueued = (item: QueuedDelivery) => tx("readwrite", (s) => s.put(item));
const deleteQueued = (id: string) => tx("readwrite", (s) => s.delete(id));

// ---- Zustand & Listener ----
let state: SyncState = { pending: 0, syncing: false, online: typeof navigator === "undefined" ? true : navigator.onLine };
const stateListeners = new Set<(s: SyncState) => void>();
const syncedListeners = new Set<(r: SyncResult) => void>();
const failedListeners = new Set<(item: QueuedDelivery, msg: string) => void>();

function setState(p: Partial<SyncState>) {
  state = { ...state, ...p };
  stateListeners.forEach((l) => l(state));
}
export const getSyncState = () => state;
export function onSyncState(l: (s: SyncState) => void) { stateListeners.add(l); l(state); return () => { stateListeners.delete(l); }; }
export function onDeliverySynced(l: (r: SyncResult) => void) { syncedListeners.add(l); return () => { syncedListeners.delete(l); }; }
export function onDeliveryFailed(l: (i: QueuedDelivery, m: string) => void) { failedListeners.add(l); return () => { failedListeners.delete(l); }; }

async function refreshCount() {
  try { setState({ pending: (await listQueued()).length }); } catch { /* ignore */ }
}

export async function enqueueDelivery(item: Omit<QueuedDelivery, "attempts" | "createdAt"> & { createdAt?: string }) {
  await putQueued({ ...item, createdAt: item.createdAt ?? new Date().toISOString(), attempts: 0 });
  await refreshCount();
  void flushQueue();
}

/** Erkennt reine Netzwerk-/Verbindungsfehler → Eintrag bleibt in der Warteschlange. */
function isTransient(error: unknown, status?: number) {
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) return true;
  if (status && (status >= 500 || status === 408 || status === 429)) return true;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return false;
}

let flushing: Promise<void> | null = null;

export function flushQueue(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    const items = (await listQueued().catch(() => [])).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (items.length === 0) { setState({ pending: 0 }); return; }
    setState({ syncing: true });
    for (const item of items) {
      const { data, error } = await supabase.functions.invoke("driver-update-stop-status", {
        body: { ...item.body, completed_at: item.createdAt },
      });
      const status = error instanceof FunctionsHttpError ? (error.context as Response)?.status : undefined;
      const serverMsg = (data as { error?: string } | null)?.error;
      if (!error && !serverMsg) {
        await deleteQueued(item.id);
        syncedListeners.forEach((l) => l({ item, data: data as SyncResult["data"] }));
        continue;
      }
      if (isTransient(error, status)) {
        await putQueued({ ...item, attempts: item.attempts + 1, lastError: error?.message ?? serverMsg });
        setState({ lastError: "Kein Netz" });
        break; // Netz weg → Rest später
      }
      if (status === 401) {
        // Sitzung abgelaufen: Eintrag behalten, nach erneutem Login nachsenden.
        setState({ lastError: "Sitzung abgelaufen" });
        break;
      }
      // Dauerhafter Fehler (z. B. Pflichtfeld fehlt) → nicht endlos wiederholen.
      let msg = serverMsg ?? error?.message ?? "Fehler";
      try {
        const j = await (error as FunctionsHttpError)?.context?.json?.();
        if (j?.error) msg = j.error;
      } catch { /* ignore */ }
      await deleteQueued(item.id);
      failedListeners.forEach((l) => l(item, msg));
    }
    await refreshCount();
    setState({ syncing: false, ...(state.pending === 0 ? { lastError: undefined } : {}) });
  })().finally(() => { flushing = null; });
  return flushing;
}

let started = false;
/** Startet automatisches Nachsenden (bei Netz-Rückkehr, App-Fokus und alle 20 s). */
export function startDeliverySync() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => { setState({ online: true }); void flushQueue(); });
  window.addEventListener("offline", () => setState({ online: false }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void flushQueue(); });
  setInterval(() => { if (state.pending > 0) void flushQueue(); }, 20000);
  void refreshCount().then(() => flushQueue());
}

// ---- Lokaler Routen-Cache, damit die Stoppliste offline sichtbar bleibt ----
export function cacheRoute(routeId: string, payload: unknown) {
  try { localStorage.setItem(`ecargo-route-cache:${routeId}`, JSON.stringify(payload)); } catch { /* voll */ }
}
export function readCachedRoute<T>(routeId: string): T | null {
  try { const r = localStorage.getItem(`ecargo-route-cache:${routeId}`); return r ? (JSON.parse(r) as T) : null; } catch { return null; }
}
