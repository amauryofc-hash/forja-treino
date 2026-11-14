/* Cache de arquivos públicos. Registros pessoais ficam somente no armazenamento do aplicativo. */
const CACHE = 'forja-publico-20261101-2';
const PREFIX = 'forja-publico-';
const SHELL = ['./', './index.html', './app.css', './finance.css'];
const STATIC_EXT = /\.(?:js|css|json|png|svg|webp|gif|woff2?)$/i;
const GYM = ['gym-catalog.js','gym-catalog-extra.js','gym-gif-extras.js','gym-gif-library-extras.js','gym-names-pt.js','gym-name-reviews-pt.js','gym-exercise-guide.js','gym-training.js','gym-gif-map.js','gym-gif-library-map.js','gym-ui.js','gym-overview.js','gym-guided-start.js','gym-suggest.js'];

async function precache() {
  const cache = await caches.open(CACHE);
  const page = await fetch('./index.html', {cache: 'no-store'});
  if (!page.ok) throw new Error('Página inicial indisponível');
  await cache.put('./index.html', page.clone());
  await cache.put('./', page.clone());
  const html = await page.text();
  const assets = new Set([...SHELL.slice(2), ...GYM]);
  const scope = new URL(self.registration.scope);
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)) {
    const url = new URL(match[1], scope);
    if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname) && STATIC_EXT.test(url.pathname)) {
      assets.add(url.pathname.slice(scope.pathname.length));
    }
  }
  await Promise.allSettled([...assets].map(async file => {
    const url = new URL(file, scope);
    const response = await fetch(url, {cache: 'no-store'});
    if (response.ok && response.type === 'basic') await cache.put(url.pathname, response);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok && response.type === 'basic') event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())));
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('./index.html'))));
    return;
  }
  if (!STATIC_EXT.test(url.pathname)) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic') event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.pathname, response.clone())));
    return response;
  }).catch(async () => (await caches.match(url.pathname)) || Response.error()));
});
