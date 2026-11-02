// Offline support for the Fuel Quantity Checksheet.
// Pages and scripts: network first (so updates arrive as soon as there's signal), cached copy when offline.
// Database and sign-in calls are never cached.
const CACHE = 'fuel-checksheet-v2';
const CORE = [
  './', './index.html', './auth.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE).then(c=>Promise.all(CORE.map(u=>c.add(u).catch(()=>{})))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', event=>{
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.hostname.endsWith('supabase.co')) return; // live data only
  const sameOrigin = url.origin === self.location.origin;
  const isLib = url.hostname === 'cdn.jsdelivr.net';
  if(!sameOrigin && !isLib) return;
  if(sameOrigin && url.pathname.endsWith('/report.html')) return; // report needs a live connection anyway
  const fromCache = ()=>caches.match(req, { ignoreSearch: true })
    .then(hit=>hit || (req.mode==='navigate' ? caches.match('./index.html') : undefined));
  const network = fetch(req).then(res=>{
    if(res && (res.ok || res.type === 'opaque')){
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
    }
    return res;
  });
  // Weak signal on the pad: if the network hasn't answered in 4 s, open the saved copy instead.
  const timeout = new Promise(resolve=>setTimeout(()=>fromCache().then(hit=>{ if(hit) resolve(hit); }), 4000));
  event.respondWith(
    Promise.race([network, timeout]).catch(()=>fromCache()).then(res=>res || network)
  );
});
