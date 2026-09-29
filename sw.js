/* 네트워크 우선(항상 서버에 최신인지 확인), 실패하면 캐시 — 오프라인에서도 마지막으로 본 화면을 연다.
   cache:'no-cache' 가 없으면 브라우저 HTTP 캐시가 옛 config.js·할인 데이터를 그대로 돌려줄 수 있다. */
const CACHE = 'fridgebank-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return; // CDN·Supabase API 는 브라우저 기본 처리
  const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(
    fresh
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
