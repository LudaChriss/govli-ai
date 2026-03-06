/**
 * FOIA Portal Service Worker - v2.0 PWA Enhancement
 * Provides offline caching, draft persistence, and push notifications
 */

const CACHE_NAME = 'foia-portal-v2.0';
const STATIC_CACHE = 'foia-static-v2.0';
const DYNAMIC_CACHE = 'foia-dynamic-v2.0';

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/submit-request',
  '/status',
  '/my-requests',
  '/reading-room',
  '/faq',
  '/offline'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API requests - network only, no cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'Offline - API unavailable' }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      })
    );
    return;
  }

  // Static assets - cache first
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached || fetch(request).then((response) => {
          return caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // All other requests - network first, cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response
        const responseToCache = response.clone();

        // Cache successful responses
        if (response.status === 200) {
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }

        return response;
      })
      .catch(() => {
        // Try to return cached version
        return caches.match(request).then((cached) => {
          if (cached) {
            return cached;
          }

          // If no cache, show offline page
          if (request.mode === 'navigate') {
            return caches.match('/offline');
          }

          // Return generic offline response
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');

  const data = event.data ? event.data.json() : {};
  const title = data.title || 'FOIA Request Update';
  const options = {
    body: data.body || 'Your FOIA request has been updated',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-96x96.png',
    tag: data.tag || 'foia-notification',
    data: data.url || '/',
    actions: [
      {
        action: 'view',
        title: 'View Request'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  event.notification.close();

  if (event.action === 'view') {
    const urlToOpen = event.notification.data || '/my-requests';

    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((windowClients) => {
          // Check if there's already a window open
          for (let client of windowClients) {
            if (client.url === urlToOpen && 'focus' in client) {
              return client.focus();
            }
          }

          // Open new window
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// Background sync event (for offline form submissions)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);

  if (event.tag === 'sync-foia-drafts') {
    event.waitUntil(syncDrafts());
  }
});

// Sync drafts function
async function syncDrafts() {
  try {
    // Open IndexedDB and retrieve pending drafts
    const db = await openDB();
    const drafts = await getAllDrafts(db);

    for (const draft of drafts) {
      try {
        const response = await fetch('/api/v1/foia/intake/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft.data)
        });

        if (response.ok) {
          // Delete draft after successful sync
          await deleteDraft(db, draft.id);
          console.log('[SW] Draft synced successfully:', draft.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync draft:', draft.id, error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync drafts failed:', error);
  }
}

// IndexedDB helpers (simplified)
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('foia-drafts', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getAllDrafts(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['drafts'], 'readonly');
    const store = transaction.objectStore('drafts');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteDraft(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['drafts'], 'readwrite');
    const store = transaction.objectStore('drafts');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

console.log('[SW] Service worker loaded');
