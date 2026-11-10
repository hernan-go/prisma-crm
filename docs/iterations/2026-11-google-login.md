# Iteración 12.2.B3 — login Google individual

## Bloque 1 publicado

Commit `5d85c649c406c61d4b9f868a572d246e65250f35` en `codex/iteration-12-identity-foundations`. Actions #70 aprobado: verify 684 aprobadas/262 omitidas y seis integraciones 208 aprobadas sin omisiones. Núcleo `completeGoogleLogin` transaccional, ocho horas absolutas y hash SHA-256. No desplegado.

## Bloque 2 local

Transporte incorporado en `binding-http.ts`; `auth.ts` agrega únicamente `googleLogin` al JSON de sesión cuando login está habilitado. `authenticated`, `configured` y los endpoints legacy conservan su semántica. El guard individual y logout corresponden al Bloque 3.

Activación explícita `GOOGLE_LOGIN_ENABLED=true`, independiente de `BINDING_ENABLED`. Reutiliza la configuración privada Google/OIDC y las variables existentes `BINDING_DB_NAME` y `BINDING_CSRF_KEY`. El HMAC de CSRF tiene dominio separado por propósito. No generar ni registrar secretos en documentación. Con binding deshabilitado sus formularios permanecen cerrados, pero login puede funcionar con esquema 017–019 previamente preparado.

`GET /api/auth/session` entrega `googleLogin: { available, csrf? }`. Cookie CSRF HttpOnly separada, máximo cinco minutos. Si preflight falla, available=false y la consulta legacy continúa. Configuración ausente de login conserva la forma anterior de la respuesta.

`POST /api/auth/google/login/start` recibe formulario exclusivamente con csrf. Origin exacto obligatorio, Fetch Metadata same-origin si está presente, CSRF HMAC, parser limitado sin compresión. Contexto login fijo y aplicación crm definida por B1. Responde 303 hacia Google y cookie temporal `prisma_login`, HttpOnly, SameSite=Lax, cinco minutos. En producción las cookies tienen Secure y prefijo __Host-, Path=/ y sin Domain. Los límites de inicio por peer y global y el máximo de dos canjes simultáneos se comparten con B2 dentro del router.

Callback único `/api/auth/google/callback`: busca state hash persistido, resuelve propósito y coteja ID/hash de navegador con su cookie independiente antes del canje. B1 vuelve a verificar contexto/state/PKCE/nonce/firma. Binding continúa en `/vincular-google` con su confirmación/aprobación anterior. Login consume la referencia mediante Bloque 1, espera el commit y emite exclusivamente en Set-Cookie el token `prisma_identity` (__Host- en producción), SameSite=Strict, vencimiento absoluto restante. Limpia temporales de login y responde 303 a `/`. No acepta destinos de redirección del cliente.

Hasta Bloque 3, cualquier cookie administrativa presentada, incluso inválida, bloquea el inicio y la finalización de login con 409. Se exige logout explícito y no se sustituye ni revoca una autoridad en este bloque. La cookie individual todavía no autoriza el guard del CRM ni es gestionada por logout legacy. No habilitar como acceso completo antes del Bloque 3. Las peticiones concurrentes que cambian el método de acceso necesitarán la política integral del Bloque 3.

Errores cerrados, sin tokens en JSON/HTML/URLs ni logs OAuth. Cada callback reserva el cupo antes de consultas asíncronas y lo libera en finally. Google se consulta antes de la transacción de emisión. Fallos no permiten volver a consumir evidencia ni conceder acceso por email.

## Validación local

Resultado final: 37/37 MySQL aprobadas, cero fallidas y cero omitidas. Suite sin MySQL: 684 aprobadas y 275 omitidas, cero fallidas. Typecheck, lint, build y diff-check aprobados; avisos conocidos de Rollup/Zod y finales de línea. La última corrida MySQL incluyó el cotejo de ID y hash de navegador previo al canje. No hay aceptación remota del Bloque 2.

Suite B2 completa ampliada a 37 casos (13 HTTP nuevos), proveedor sintético y MySQL 8.4.11 independiente acreditado por Paso 3C. Las corridas usan un datadir nuevo, puerto distinto de 3306, usuario limitado al esquema prisma_disposable_b2, UUID y marcador aleatorio. Migraciones y fixtures solamente en ese destino; proceso y datadir eliminados en finally. Ninguna escritura sobre bases conservadas ni cambios de configuración persistente.

Casos nuevos: login y replay, Origin/CSRF/propósito adicional, bloqueo de ambas cookies administrativas al iniciar y regresar, callback concurrente, coexistencia binding/login, nonce/proveedor/vencimiento/navegador/state inválidos, cookies productivas y caída DB. Regresiones previas B2, siete casos transaccionales B3 y límite compartido conservados.

Incidencias corregidas en pruebas: cookie jar de Supertest sustituía la cookie manipulada (ahora otro agente); el proveedor sintético fijaba redirect_uri local (ahora argumento confiable de fixture con valor predeterminado anterior). La suite sin MySQL detectó tres comparaciones exactas de la respuesta legacy; se corrigió el transporte para agregar googleLogin únicamente cuando se activa explícitamente.

Navegador real, Google real, SameSite durante navegación externa, logout/cambio de cuenta integrado y CI de este bloque pendientes. Pruebas HTTP no acreditan esos escenarios de navegador. Sin cambios de workflows, migraciones, frontend, CLI ni guard general. Commit/publicación de Bloque 2 requieren autorización posterior.
