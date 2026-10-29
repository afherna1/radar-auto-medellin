/* Radar Auto: cache local para consulta sin conexión, servidor primero para promociones. */
const CACHE_NAME = 'radar-auto-pwa-v3';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const home = new URL('./index.html', self.registration.scope).href;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('radar-auto-') && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin) return;
  if(request.mode==='navigate') {
    event.respondWith((async () => {
      try {
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok) {const cache=await caches.open(CACHE_NAME); await cache.put(home,response.clone());}
        return response;
      } catch(e) {
        return (await caches.match(home)) || Response.error();
      }
    })());
    return;
  }
  if(url.pathname.endsWith('/data/monitor_status.json')) {
    event.respondWith((async () => {
      const canonical=new URL('./data/monitor_status.json',self.registration.scope).href;
      try {const response=await fetch(request,{cache:'no-store'}); if(response.ok) {const cache=await caches.open(CACHE_NAME);await cache.put(canonical,response.clone());}return response;}
      catch(e){return (await caches.match(canonical)) || Response.error();}
    })());
    return;
  }
  // Iconos/manifest se leen desde caché; el HTML se valida siempre contra el servidor.
  if(url.pathname.endsWith('.png')||url.pathname.endsWith('.webmanifest')) {
    event.respondWith(caches.match(request).then(res => res || fetch(request)));
  }
});
