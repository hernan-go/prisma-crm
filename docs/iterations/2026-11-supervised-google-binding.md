# Iteración 12.2.B2 — vinculación Google supervisada

Implementación local sobre `adf27d4`, rama `codex/iteration-12-identity-foundations`, sin staging, commit, push, merge ni despliegue. Núcleo y flujo HTTP/CLI implementados; prueba sintética y QA visual realizadas. **Aceptación con Google real pendiente** de los dos titulares y del operador. No hay login administrativo Google ni sesiones operativas nuevas. Auth heredada, economía, MCP y migraciones 017–019 intactos. Sin nuevas migraciones.

## Composición y atomicidad

`identity-bindings.ts` conserva el motor 12.2.A. authorize(context, action, connection) y verifyCandidate(evidence, binding, connection) reciben la misma PoolConnection de identityMutation. Se valida primero institución, operación, UUID, código y ausencia de candidatura; después el adaptador consume evidencia B1 de propósito binding y contexto exacto dentro de esa transacción. UPDATE de candidatura condicionado por reloj MySQL/estado y una fila afectada. Auditoría y consumo revierten juntos si falla la escritura. El sub ya vinculado se rechaza en presentación, además de la comprobación de aprobación existente.

La huella SHA-256 es dominio + operación + UUID + sub, serializados sin ambigüedad. La CLI inspecciona la candidatura y exige una huella coincidente aportada por el operador; approve la compara de nuevo bajo bloqueo. La API interna admite ausencia de huella para consumidores internos previos de prueba, pero la composición operativa CLI la exige y no hay rutas HTTP de aprobación. No existe autoridad operator por defecto ni a partir de JSON/contraseña compartida.

Google se consulta solamente por complete de B1: claim se confirma antes de red y se vuelve a verificar la evidencia sin mantener bloqueos MySQL durante token/JWKS. Orden de mutaciones institucionales: singleton → operación/contexto → intento. Binding begin también toma el singleton y contexto antes de reemplazar intentos del mismo navegador, evitando orden inverso. Deadlocks/errores producen rollback, sin reintento automático ni bypass.

`binding-operations.ts` compone browserBindings (authorize siempre deniega; verifyCandidate consume OIDC) y operatorBindings (capacidad Symbol privada del proceso CLI). Las funciones de servidor son código confiable; no constituyen aislamiento frente a ejecución maliciosa dentro del proceso.

## CLI y bootstrap

Desarrollo: `npm run identity:admin -- <comando> <DB_NAME> [argumentos]`. Distribución compilada: `node dist/server/identity-cli.js <comando> <DB_NAME> [argumentos]`. La CLI pertenece a server y se incluye en el build sin depender de tsx productivo.

Requiere stdin/stdout TTY, DB_NAME de runtime explícito e igual al argumento. Preflight SELECT DATABASE() exacto, registros 017–019, singleton y columnas necesarias antes de escribir. No ejecuta migraciones. No constituye una auditoría completa del DDL frente a deriva manual. Las credenciales provienen de la configuración privada normal del servidor, nunca de argumentos ni del chat.

| Comando   | Argumentos adicionales  | Resultado                                                                                                                     |
| --------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| preflight | ninguno                 | Destino y esquema accesibles, sin escritura                                                                                   |
| status    | ninguno                 | Dos UUID, nombres institucionales, estado/bootstrap y existencia de vínculo; sin sub/token/credenciales                       |
| prepare   | ninguno                 | Propone dos UUID para Jesica/Hernán; tras confirmación crea ambos deshabilitados/sin roles y configura bootstrap atómicamente |
| configure | UUID_JESICA UUID_HERNAN | Configura dos identidades existentes deshabilitadas y sin roles/vínculos; alternativa a prepare, no un reset                  |
| issue     | UUID initial o replace  | Invalida autorizaciones previas y entrega una autorización de 15 minutos                                                      |
| inspect   | OPERACION UUID          | Operación, UUID, vencimiento y huella, sin sub completo                                                                       |
| approve   | OPERACION UUID          | Solicita huella independiente y confirmación; aprueba exactamente esa candidatura                                             |
| revoke    | OPERACION UUID          | Revoca autorización/candidatura pendiente tras confirmación                                                                   |
| maintain  | ninguno                 | Limpia temporales y cierra operaciones vencidas, conservando operaciones y auditoría                                          |

Operaciones sensibles requieren frase exacta `CONFIRM <DB_NAME> <comando>`. prepare muestra los UUID antes de confirmar. Si falla una parte de su transacción no deja usuarios huérfanos. Si ya está configurado, usar status y continuar sobre esos UUID, no volver a prepare. Tras aprobar el primero puede completarse el segundo desde otra instancia CLI. Al aprobar ambos se cierra el bootstrap persistentemente, sin comando ordinario de reapertura.

issue muestra el código UNA VEZ en el terminal autorizado: entregarlo por un canal privado, sin query strings, capturas compartidas, logs de CI ni transcripciones de consola. UUID/operación no son autoridad. El titular lo introduce al iniciar y vuelve a introducirlo al confirmar; solo hash en DB y sin almacenamiento web del código.

El operador verifica presencialmente o por un canal previamente conocido que la persona es Jesica/Hernán y que el recibo del navegador coincide con la huella CLI. OIDC prueba control de cuenta, no identidad humana. Una cuenta ajena con código robado puede presentar una candidatura, pero no obtiene privilegios: el operador debe rechazarla/revocarla y emitir una autorización nueva. Ninguna regla por correo ni activación automática.

Un reemplazo se emite con replace después del cierre, sobre UUID conservado. La aprobación conserva estado/roles, revoca sesiones y audita; no levanta suspensiones. La recuperación excepcional cuando ambos pierden acceso utiliza autoridad operativa independiente y nueva comprobación humana, **nunca reabre bootstrap**. No se declara recuperación productiva ensayada.

Permisos mínimos recomendados para operación: SELECT de schema_migrations y tablas de identidad; INSERT/UPDATE institucionales y auditoría; DELETE en identidades externas para reemplazo y en intentos OIDC para purga. No se requieren privilegios DDL ni escritura económica por estas herramientas. No se creó ni cambió ningún usuario MySQL; los grants concretos de SiteGround deberán verificarse aparte. Una denegación aborta, no provoca concesiones automáticas.

## Configuración HTTP privada y aislamiento

Activación explícita `BINDING_ENABLED=true`; `BINDING_DB_NAME` debe coincidir con la DB efectiva. Google: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI. Cifrado B1: OIDC_ACTIVE_KEY_ID y OIDC_KEYS_JSON (mapa de key ID a clave AES de 32 bytes en hex minúsculo). BINDING_CSRF_KEY: clave independiente de 32 bytes en hex minúsculo. No VITE_*, no secretos en repositorio ni argumentos, no reutilizar contraseña/SESSION_SECRET como autoridad. No se accedió a configuración privada Google real.

Callback de desarrollo exacto `http://localhost:5173/api/auth/google/callback`. En producción, HTTPS exacto configurado. El frontend sigue usando localhost y proxy Vite /api → 127.0.0.1:3001. La página pública /vincular-google la sirve Express; en desarrollo se puede abrir directamente `http://localhost:3001/vincular-google` y el formulario apunta a la API en 3001, pero Origin debe ser el origen del callback 5173, por lo que **el flujo real debe usar 5173**; no usar ese acceso directo para la ceremonia. Vite necesita enrutar también esa página a Express: ver configuración del proxy incorporada en B2.

Sin configuración, configuración inválida o esquema ausente, B2 responde 503 genérico; no consulta DB con OIDC deshabilitado ni afecta login/session/logout heredados. Inicialización compartida comprueba esquema y limpia antes de aceptar flujo; fallo inicial deja B2 cerrada hasta reinicio. Los errores remotos no inhabilitan otras rutas. El router es terminal, antes del parser/guard heredados, con namespace cerrado sin endpoints privilegiados.

## Rutas, cookies y seguridad

| Ruta                                 | Contrato                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| GET /vincular-google                 | HTML mínimo de inicio o confirmación, CSRF; sin recursos externos ni scripts                     |
| POST /api/auth/google/binding/start  | Form operationId, code, csrf; valida código/contexto antes de iniciar Google; 303 a autorización |
| GET /api/auth/google/callback        | Query original acotada, state único, cookie y contexto DB; completa B1; 303 a confirmación       |
| POST /api/auth/google/binding/submit | Form code y csrf; consume evidencia y guarda candidatura; recibo de huella pendiente             |
| POST /api/auth/google/binding/cancel | csrf; invalida intento/evidencia y elimina cookies; no revoca una candidatura ya presentada      |

La aprobación/revocación administrativa ocurre solo en CLI. No configuración, recuperación, roles o sesiones Google por HTTP. Los métodos no previstos reciben 405 y subrutas Google desconocidas 404.

Cookie temporal de correlación prisma_binding y cookie prisma_binding_csrf, ambas HttpOnly/host-only/Path=/, SameSite=Lax y máximo cinco minutos. En producción Secure y prefijo __Host-. El CSRF es HMAC con clave independiente y no revela el secreto de correlación. Origin exacto obligatorio en POST; Fetch Metadata, si existe, debe ser same-origin. Se rechazan duplicados/entradas no previstas. El GET externo de Google no exige Origin local: state, cookie, PKCE y nonce lo protegen.

La correlación permanece estable dentro de un flujo temporal del navegador y se destruye al concluir/cancelar. Los intentos binding con el mismo browser_hash se reemplazan bajo bloqueo institucional en B1; incluso inicios concurrentes dejan uno activo durable. Las respuestas concurrentes pueden llevar al navegador a un intento ya reemplazado: se rechaza y se inicia otro, nunca se conceden privilegios. No se crean cookies administrativas ni se reutilizan las existentes.

Parser URL-encoded de 4 KiB, cuatro parámetros, sin inflación. No-store, no-referrer, frame-ancestors none, form-action self, base-uri none, sin scripts/recursos externos. Código solo en POST; callback construido desde URI configurada, sin Host reenviado. Errores genéricos y sin logs de cuerpos/cookies/URLs OAuth. El error de un formulario conserva una vía de cancelación/reinicio.

Límites por proceso: 10 inicios/15 minutos por peer, cinco por operación, 50 inicios globales/15 minutos; 10 confirmaciones/cancelaciones por peer; 30 callbacks por peer; máximo dos canjes simultáneos. Se usa socket.remoteAddress y normalización IPv6, **no X-Forwarded-For ni req.ip derivada de trust proxy no verificado**. Si el hosting oculta/agrega peers, los usuarios comparten contador; no se afirma identificación individual real detrás del proxy. Los límites globales y de concurrencia permanecen como defensas. Contadores en memoria reinician y no se comparten entre procesos; consumo/replay sí dependen de MySQL. Verificar topología/protección perimetral antes de producción, sin debilitar reglas para conseguir IPs.

## Mantenimiento

Al primer uso HTTP se limpian temporales antes de habilitar el flujo. server/index.ts incorpora intervalo ligero de diez minutos, unref, con detención al cerrar servidor. Función compartida evita trabajos solapados en el proceso; errores genéricos no inutilizan CRM. CLI maintain reutiliza la misma función. No nuevo servicio ni migración.

cleanup B1 invalida material vencido y purga intentos terminales vencidos más de 24 horas, respetando FK. Operaciones institucionales vencidas se cierran con revoked_at y evento binding.expired en transacción, sin eventos duplicados por concurrencia. **No se eliminan operaciones institucionales terminales ni auditoría**, tampoco tras siete días. Los registros administrativos retenidos pueden crecer según uso; cualquier política de eliminación necesita aprobación futura. Durante caídas no hay purga garantizada; el vencimiento lógico sigue impidiendo consumo.

## Validación y límites

Validación final: 95 pruebas focalizadas únicas aprobadas, cero fallidas y cero omitidas en las corridas finales. Typecheck, lint, build y diff-check aprobados; build con advertencias conocidas no bloqueantes de anotaciones Zod/Rollup. Las variantes de ruta con barra final/mayúsculas se cierran explícitamente y su regresión está aprobada. YAML de CI parseado y orden/exclusiones/ausencia de tolerancia al fallo comprobados, sin ejecución remota de Actions. Búsqueda focalizada sin patrones de credenciales reales en archivos nuevos. Proxy /vincular-google en Vite 5173 → fixture Express 3001 comprobado por HTTP 200; strictPort preserva el callback registrado. Evidencia local acumulada: núcleo/compatibilidad 51, CLI cuatro, identidad MySQL cinco, vinculaciones siete, OIDC trece y B2 quince pruebas focalizadas aprobadas. Las suites DB se ejecutan en procesos secuenciales, solo prisma_test con guard de host y SELECT DATABASE antes de escribir; no vacían bases ni limpian datos ajenos a sus UUID. CI excluye las tres suites institucionales con estado compartido de la fase general y luego ejecuta bindings → oidc-db → binding-b2-db.

Las pruebas incluyen proveedor sintético con firmas RSA, transacción conjunta y rollback de auditoría, vencimiento final MySQL tras consumo, concurrencia de presentación/aprobación, huella cambiada, reemplazo/revocación de sesiones, último administrador, reinicio entre aprobaciones, cuenta ajena pendiente/revocada, CSRF/Origin/compresión/navegador/replay/cancelación, límites por operación y peer no manipulables por XFF, dos canjes remotos sin bloqueos DB, cookies productivas y mantenimiento sin purga institucional. CLI prueba TTY/destino, confirmaciones, huella y preflight fallido; el operador usa las mismas operaciones DB integradas. No se afirma una sesión CLI humana real ni verificación SiteGround.

Primeras corridas: una expectativa HTTP antigua asumía legacy sin configurar, pero runtime lo tenía configurado; se verifican ambos estados de denegación 401/503 sin acceso. Dos pruebas 12.2.A esperaban el orden anterior de errores; se ajustaron al rechazo previo de operación y al rechazo temprano de sub duplicado. Corridas posteriores aprobadas. No se corrigieron módulos ajenos.

QA visual sintética del renderizador real con tests/browser/binding-qa.ts: navegador integrado, inicio/confirmación/error/pendiente/deshabilitado, foco de teclado visible y submit sintético a error; sin overflow observado en confirmación móvil y deshabilitado escritorio. Viewports solicitados 1440×900 y 390×844; efectivos medidos 1143×714 y 309×670 por escalado del navegador. Consola sin errores/warnings capturados. No auditoría completa de accesibilidad/lector de pantalla. Screenshot local ignorada tmp/binding-mobile.png. Fixture sin DB/Google, servidor temporal detenido al finalizar. Conectividad inicial del sandbox falló (EACCES/timeout); el servidor en host respondió 200 y mostró HTML esperado antes de abrir navegador.

## Ensayo humano pendiente y aceptación

### Revisión focalizada de seguridad posterior

Revisión sin staging/commit ni Google real. Se detectó y corrigió un bloqueante de B2 en binding-http.ts: el límite de dos canjes se comprobaba antes de await bindingAttempt, pero se incrementaba después; varios callbacks podían pasar simultáneamente la comprobación. Ahora se reserva el cupo de forma síncrona antes de la primera consulta asíncrona y se libera en finally incluso si falla la correlación. No cambia el contrato HTTP ni el esquema.

La regresión reforzada bloquea deliberadamente las dos consultas de correlación y exige que un tercer callback reciba 429 ANTES de liberarlas. Además conserva la comprobación de ausencia de bloqueos durante red. Se añadieron dos casos críticos: prueba OIDC auténtica/vigente de otra operación válida o propósito login rechazada sin consumo, y dos candidaturas del mismo sub creadas antes del primer vínculo, cuya segunda aprobación debe rechazarse sin consumir operación ni habilitar usuario.

Las expectativas antiguas que pasaron de Unverified a rechazo genérico responden al nuevo orden: la operación/UUID/candidatura se validan antes del adaptador. El rechazo de objetos forjados sobre una operación vacía ya se cubre en B2. El rechazo temprano del sub duplicado es correcto, pero no sustituye la comprobación de unicidad al aprobar; el caso nuevo conserva expresamente esa cobertura temporal.

Autoridad CLI: no es el TTY. Es acceso operativo al proceso/código y a la configuración/conexión MySQL autenticada; el Symbol privado separa esa composición del HTTP y el TTY/confirmaciones previenen uso accidental. No se afirma comprobada la ACL del sistema operativo, identidad SSH ni grants de SiteGround. El destino se coteja por nombre de DB y esquema; no se fija una identidad independiente del servidor MySQL. Verificar también host/entorno antes de producción, sin tratar la coincidencia de nombre como certificación del hosting.

La estructura B2 permite B3 (UUID estable, vínculo por sub, estado/roles y sesiones internas). B3 deberá validar asociación actual y crear sesión en una transacción coherente, sin encadenar de forma ingenua findExternalIdentity y createIdentitySession; no se implementa aquí. Mantenimiento conserva registros institucionales/auditoría; la exclusión de solapamientos es por proceso y los bloqueos MySQL arbitran ejecuciones desde CLI/otras instancias. No se repite QA visual por no haber cambios de UI; sus dimensiones solicitadas/efectivas permanecen diferenciadas arriba.

Validación de esta revisión: tres regresiones de seguridad aprobadas y 14 casos omitidos deliberadamente por el filtro -t en binding-b2-db.test.ts; nueve pruebas de auth/aislamiento aprobadas, cero fallidas. Typecheck, lint, build y diff-check aprobados. Build conserva advertencias conocidas no bloqueantes de Zod/Rollup. Las 95 pruebas del cierre anterior constituyen evidencia previa, no una nueva corrida completa. No se repitió QA visual ni se probaron cuentas Google reales. Dictamen: APTO CON OBSERVACIONES para eventual commit local, que esta revisión no autoriza.

No se probó Google real ni se crearon identidades empresariales reales. Para ensayo local posterior autorizado:

1. Configurar privadamente variables OIDC/CSRF y destino prisma_test; no enviarlas al chat. No usar prisma_dev mientras 017–019 no estén preparadas mediante una intervención separada autorizada.
2. Verificar preflight y estado existente. No ejecutar prepare si ya hay institución configurada. En destino de ensayo permitido, prepare muestra y confirma los dos UUID, luego issue entrega código temporal a cada titular.
3. Iniciar backend con ese destino y Vite en 5173 estricto; abrir http://localhost:5173/vincular-google. Cada titular elige su cuenta Google de prueba y confirma con el código reintroducido.
4. Comparar recibo/huella por canal humano independiente; inspect/approve sobre esos UUID. Comprobar pendiente sin acceso antes de aprobar, estado de ambas vinculaciones y bootstrap cerrado después. Cuenta ajena se rechaza mediante revocación del operador, sin privilegios automáticos.
5. Comprobar login/session/logout heredados, y que vincular no permite ingresar al CRM con Google. No borrar la institución por SQL para repetir el ensayo; prever fixtures/estado autorizado antes de empezar.

Hasta completar ese ensayo, B2 está implementada y probada con proveedor sintético, **pendiente de aceptación funcional real**. SiteGround: verificar acceso operativo, Node compatible, artefacto CLI, configuración privada disponible, permisos DB y procedimiento excepcional de recuperación; no están comprobados ni resueltos automáticamente por esta CLI. body-parser continúa independiente y prioritario antes de publicación. B3/B4, PWA y despliegue excluidos. Se mantienen dos publicaciones productivas separadas y expresamente autorizadas.
