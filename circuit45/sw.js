// Circuit 45 moved to /Circuit45/ — this worker removes itself.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister().then(()=>self.clients.matchAll()).then(cs=>cs.forEach(c=>c.navigate(c.url)))));
