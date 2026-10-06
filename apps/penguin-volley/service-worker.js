// Offline support: the whole game is cached on install. build.js replaces
// __APP_VERSION__ with a hash of the app's files, so every change gets a new cache.
const PREFIX = 'penguin-volley-';
const CACHE = PREFIX + '__APP_VERSION__';
const FILES = [
    './',
    './index.html',
    './styles.css',
    './manifest.webmanifest',
    './js/main.js',
    './js/physics.js',
    './js/ai.js',
    './js/render.js',
    './js/input.js',
    './js/audio.js',
    './js/i18n.js',
    './icons/icon.svg',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/maskable-512.png',
    './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    // Only this app's old caches: other apps on the same origin keep theirs.
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return;
    e.respondWith(
        caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' })
            .then(hit => hit || fetch(e.request).then(res => {
                if (res.ok && url.pathname.startsWith(new URL('./', location).pathname)) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, copy));
                }
                return res;
            }))
            .catch(() => caches.match('./index.html')),
    );
});
