/*
 * ZeroAuth service worker — PWA offline support + web push.
 *
 * Strategy:
 *   - App shell + static assets: cache-first, populated on install + on access.
 *   - Navigations: network-first with an offline fallback page.
 *   - API writes (POST/PUT/PATCH/DELETE) made while offline: queued in IndexedDB
 *     and replayed via the Background Sync API when connectivity returns.
 *   - Push: render notifications and focus/open the app on click.
 *
 * The version string busts old caches on deploy. Bump it when the precache
 * list or caching behaviour changes.
 */
const VERSION = "v1";
const SHELL_CACHE = `zeroauth-shell-${VERSION}`;
const RUNTIME_CACHE = `zeroauth-runtime-${VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = ["/", OFFLINE_URL, "/manifest.json", "/icon-192.png", "/icon-512.png"];

const SYNC_TAG = "zeroauth-write-queue";
const DB_NAME = "zeroauth-pwa";
const STORE_NAME = "write-queue";

// ─── Install / activate ───────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch routing ──────────────────────────────────────────────────────────

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET here. Cross-origin (e.g. API on :1337) and
  // mutations are handled separately / passed through.
  if (request.method !== "GET") {
    // Offline write queueing for same-origin API mutations is handled by the
    // page (it posts to the queue); the SW just lets these hit the network.
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigations → network-first, fall back to cache, then offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Static assets → cache-first with background refresh (stale-while-revalidate).
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ─── Background sync: replay queued writes ────────────────────────────────────

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueue());
  }
});

// Allow the page to trigger a flush immediately (e.g. on `online` event) for
// browsers without Background Sync.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FLUSH_WRITE_QUEUE") {
    event.waitUntil(replayQueue());
  }
});

function openDB() {
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

async function replayQueue() {
  const db = await openDB();
  const all = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const item of all) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // Success, or a client error that won't succeed on retry → drop it.
        await deleteFromQueue(db, item.id);
      }
    } catch {
      // Still offline — stop and let the next sync event retry.
      break;
    }
  }

  // Tell open clients the queue was flushed so they can refresh data.
  const clients = await self.clients.matchAll();
  clients.forEach((c) => c.postMessage({ type: "WRITE_QUEUE_FLUSHED" }));
}

function deleteFromQueue(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Web Push ─────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ZeroAuth", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "ZeroAuth";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || data.type || "zeroauth",
    data: { link: data.link || "/dashboard" },
    renotify: Boolean(data.tag),
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.link) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if one is open, otherwise open a new one.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
