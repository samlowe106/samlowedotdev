/* Retires the service workers Chirpy registered at this URL before the PWA was
   turned off. A browser that still has one keeps polling this path, and pages
   no longer load the code that would unregister it. It picks up this script
   through its normal update check, then clears the cache and removes itself. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
  );
});
