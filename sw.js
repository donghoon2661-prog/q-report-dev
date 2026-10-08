/* 홈 화면 설치(PWA)용 최소 서비스 워커 — 캐시·가로채기 없음.
   안드로이드 Chrome이 설치 가능 사이트로 인식하도록 fetch 핸들러만 둔다. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* 브라우저 기본 처리 */ });
