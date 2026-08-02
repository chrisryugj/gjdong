// 인파레이더 PWA 설치 요건용 최소 서비스워커 (캐싱 없음 — 데이터가 5분 주기 실시간이라 패스스루)
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))
self.addEventListener("fetch", () => {})
