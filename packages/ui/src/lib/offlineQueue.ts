/**
 * Client-side write queue for offline support.
 *
 * When a mutating API request fails because the browser is offline, we persist
 * it to IndexedDB (the same store the service worker drains via Background
 * Sync). This mirrors the SW's store so writes survive a full reload while
 * disconnected, and replay automatically on reconnect.
 */
const DB_NAME = "zeroauth-pwa";
const STORE_NAME = "write-queue";
const SYNC_TAG = "zeroauth-write-queue";

export interface QueuedWrite {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  queuedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** True when the request is a mutation worth queueing. */
export function isQueueableMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

export async function enqueueWrite(write: QueuedWrite): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add(write);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Ask the service worker to replay when connectivity returns. Background Sync
  // is best-effort; the `online` listener in the registrar is the fallback.
  try {
    const reg = await navigator.serviceWorker?.ready;
    // @ts-expect-error — `sync` is not in the lib DOM types yet
    if (reg && "sync" in reg) await reg.sync.register(SYNC_TAG);
  } catch {
    // Background Sync unavailable — the registrar's online handler covers it.
  }
}

export async function pendingWriteCount(): Promise<number> {
  if (typeof indexedDB === "undefined") return 0;
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(0);
  });
}
