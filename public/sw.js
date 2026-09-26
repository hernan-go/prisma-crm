/* PRISMA is online-only. Never cache API responses or personal data. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PRISMA CRM</title><body style="background:#202526;color:#e6eaea;font:18px system-ui;padding:32px"><h1>PRISMA CRM</h1><p>Necesitás conexión para consultar o modificar datos.</p><a style="color:#78cbb2" href="/">Reintentar</a></body></html>',
            {
              status: 503,
              headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
            },
          ),
      ),
    );
  }
});
