# Iteración 9 — Preparación de publicación controlada, integración deshabilitada

Preparación local del 25/10/2026. No autoriza commit, push, merge, deploy, cambios productivos de configuración ni conexión del Site. Contrato empresarial 2.0 y D024 intactos. Sin cambios de código necesarios: la ausencia de AI_READ_TOKEN_SHA256 ya deniega el acceso antes de leer datos.

## Evidencia comprobada

- Rama local codex/iteration-9-ai-read-context, HEAD 501f5bb; cambios previos sin commit.
- Consulta remota git ls-remote: main en bcf9f3f995150bf34c2db5750169a2851f21d1d9. La rama de trabajo no aparece entre las referencias remotas consultadas. Sin fetch ni modificación de referencias locales. El commit documental 501f5bb continúa local.
- GET anónimo a https://crm.prismacomunidad.com.ar/: HTTP 200, certificado verificado por curl sin omitir validación TLS.
- GET anónimo a http://crm.prismacomunidad.com.ar/: HTTP 200, sin redirect_url. No se acredita redirección HTTPS para la raíz. No se enviaron credenciales ni se inspeccionaron datos empresariales.
- Seis pruebas locales focalizadas aprobadas de falta de configuración, separación administrativa, HTTPS/proxy; 43 casos del archivo omitidos en esta ejecución. Sin MySQL ni pruebas sobre la nueva ruta productiva.
- Sin conector SiteGround disponible y sin acceso efectuado a un panel autenticado. No se comprobaron proxy concreto, peers, Host recibido en Node, normalización de encabezados ni listener productivo.

La documentación oficial describe proceso Node supervisado, servidor web gestionado por SiteGround y variables runtime en Site Tools. No acredita la cadena de proxy de esta instalación ni garantiza IPs concretas o sobrescritura de X-Forwarded-Proto. No asumir permiso de editar Nginx.

## Datos a verificar manualmente, sin comunicar secretos

En Client Area → Websites → Node.js Projects → proyecto del CRM → Site Tools:

1. Node.js → Deployment Options: repositorio, rama enlazada, estado de auto-deploy, comando build/start, runtime, despliegue activo y alcance de las variables de entorno. No cambiar rama ni pulsar acciones de publicación durante esta comprobación.
2. Deployment Options → Settings / Environment variables: confirmar únicamente presencia/ausencia o valores no secretos de NODE_ENV, APP_URL, HOST/PORT y las cuatro variables AI_READ_*. No mostrar valores de DB_PASSWORD, SESSION_SECRET, ADMIN_PASSWORD_HASH, AI_READ_TOKEN_SHA256 ni otras credenciales. Confirmar si guardar variables reinicia o redepliega la aplicación antes de hacerlo.
3. Security → SSL Manager y HTTPS Enforce: certificado/dominio correcto y estado de imposición HTTPS. El HTTP 200 observado requiere aclaración/corrección antes de usar credenciales; no transmitir un token por HTTP aunque luego haya redirección.
4. Node.js → Logs: SHA activo, resultado build y mecanismo de reinicio. Statistics → Access Log / Error Log: formato de logs y redacción de Authorization; no copiar logs con datos privados.
5. Consultar soporte de SiteGround si el panel no documenta: proceso que termina TLS y reenvía a Node; IPs exactas/estabilidad de peers vistos por socket.remoteAddress; aislamiento del puerto Node frente a Internet; sobrescritura del Host y de X-Forwarded-Proto, incluso si el cliente los envía falsificados; número de instancias; comportamiento al actualizar variables. Consultar también efecto de CDN o rutas alternativas. No enviar secretos al soporte ni pedir reglas de proxy permisivas.

Fuente de pantallas: https://www.siteground.com/kb/manage-node-js-project. Fuente del modelo de publicación: https://www.siteground.com/academy/node-js-shared-hosting. Comprobadas documentalmente, no mediante acceso al panel de la cuenta.

## Primera publicación: deshabilitada

Después de autorización separada y revisión del conjunto de archivos:

1. Confirmar en TODAS las fuentes runtime que AI_READ_TOKEN_SHA256 está ausente o vacío. No copiar el .env local ni usar .env.example como configuración productiva. No generar todavía una credencial de integración.
2. NODE_ENV=production, APP_URL HTTPS y AI_READ_ALLOW_LOCAL_HTTP=false. Conservar las variables administrativas/DB existentes; no mostrarlas ni cambiarlas. AI_READ_PUBLIC_ORIGIN y AI_READ_TRUSTED_PROXY_IPS pueden quedar ausentes durante esta fase. No alterar TRUST_PROXY administrativo para habilitar IA.
3. Autorizar primero el commit local. La integración y el push requieren su propia autorización posterior; el propietario controla el push que puede disparar SiteGround. No publicar la rama de trabajo suponiendo que carece de efectos automáticos.
4. Publicar el backend, sin migraciones. Verificar SHA desplegado y build, login y lectura administrativa habituales. Comprobar la nueva URL por HTTPS sin credenciales: 503 con code=not_configured y Cache-Control: no-store, sin datos ni Set-Cookie. Bajo límite de ingreso, también un Bearer ficticio debe dar 503.
5. Mantener el Site sin conectar y la variable del hash vacía hasta completar infraestructura y procedimiento de habilitación. Un 503 en esta fase demuestra desactivación; NO demuestra que el proxy sea confiable, porque la guarda de configuración corre antes que la de transporte.

Es segura esta fase respecto de la exposición de datos por la integración si el hash falta efectivamente. No implica haber verificado la infraestructura o la seguridad general del sitio HTTP actual. No es necesario debilitar controles ni agregar otro flag de activación.

## Pruebas de aceptación reproducibles, pendientes de ejecución productiva

Usar un cliente servidor a servidor sin cookies, Origin o Sec-Fetch-Site, con validación TLS, timeout y sin seguir redirecciones con Authorization. Las pruebas con tokens válidos se ejecutarán solo después de verificar el transporte y recibir autorización para configurar secretos.

Comprobaciones sin credenciales, después de publicar deshabilitado:

```powershell
curl.exe --silent --show-error --max-time 15 --proto =https --output NUL --write-out 'status=%{http_code} tls=%{ssl_verify_result}\n' https://crm.prismacomunidad.com.ar/
curl.exe --silent --show-error --max-time 15 --proto =http --output NUL --write-out 'status=%{http_code} redirect=%{redirect_url}\n' http://crm.prismacomunidad.com.ar/
curl.exe --silent --show-error --max-time 15 --proto =https --include 'https://crm.prismacomunidad.com.ar/api/integrations/ai/monthly-context?period=2026-10'
```

Resultados: HTTPS con certificado válido; HTTP debe imponer HTTPS antes de habilitar credenciales; integración deshabilitada debe devolver 503/not_configured. Las peticiones HTTP de comprobación nunca llevan Authorization.

Con transporte verificado y configuración de integración habilitada, antes de conectar el Site:

| Prueba      | Ejecución                                                                                               | Resultado esperado                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anónimo     | GET HTTPS al endpoint, sin Authorization                                                                | 401; sin datos.                                                                                                                                                                                  |
| Incorrecto  | Mismo GET con Bearer de 64 ceros, marcador ficticio público                                             | 401; no registrar el header.                                                                                                                                                                     |
| Proxy HTTPS | GET HTTPS anónimo enviando X-Forwarded-Proto: http y luego https,http                                   | El borde sobrescribe al valor real; 401 al llegar con transporte válido, no aceptación ciega del valor del cliente. Si llega una cadena a Node, se rechaza y se investiga; no ampliar confianza. |
| Proxy HTTP  | GET HTTP anónimo con X-Forwarded-Proto: https                                                           | Redirección HTTPS del borde o rechazo 403; nunca demuestra HTTPS por aceptar la cabecera. No seguir redirect ni enviar credencial.                                                               |
| Host        | Confirmación del Host efectivo en Node por soporte/diagnóstico acotado, sin registrar headers completos | Coincide exactamente con el origen configurado. Pruebas de Host ajeno sin credenciales deben ser rechazadas por borde o aplicación; no enviar secretos a rutas virtuales alternativas.           |
| Listener    | Desde fuera, conexión TCP únicamente a IP/puerto reales confirmados por el proveedor                    | Sin acceso directo a Node desde Internet. No escanear puertos ni suponer que PORT=3001 en SiteGround.                                                                                            |
| Válido      | GET HTTPS con token cargado en memoria por cliente seguro                                               | 200, JSON 2.0 validado; no imprimir el token ni la respuesta empresarial completa en consola compartida.                                                                                         |
| Alcance     | Token de servicio sin cookies: GET /api/people y GET /api/integrations/ai/people                        | 401 administrativo (o 503 si su auth no estuviera configurada) y 404 dentro del namespace; sin datos.                                                                                            |
| Escrituras  | Token válido: POST/PUT/PATCH/DELETE/HEAD/OPTIONS al endpoint                                            | 405, sin escritura.                                                                                                                                                                              |
| Logs        | Revisar configuración y registros de prueba usando primero el marcador ficticio                         | Sin Authorization, tokens, hashes ni cuerpos empresariales en logs, build o respuestas de error. No usar verbose/trace con token válido.                                                         |
| Revocación  | Retirar hash y reiniciar todas las instancias                                                           | 503; token anterior deja de habilitar consultas.                                                                                                                                                 |

Un timeout al puerto desde una sola ubicación no prueba aislamiento universal: complementar con confirmación del proveedor. No se incorpora endpoint público de diagnóstico ni se registran headers completos para obtener estas evidencias. Si la plataforma no puede garantizar la cadena, detener habilitación.

## Habilitación y conexión real posteriores

1. Completar verificaciones de proxy, HTTP/HTTPS, aislamiento, logs y número de instancias. Varias instancias necesitan rate limit compartido antes de habilitar. Confirmar valores sin secretos de AI_READ_PUBLIC_ORIGIN=https://crm.prismacomunidad.com.ar y peers exactos de AI_READ_TRUSTED_PROXY_IPS.
2. Con autorización, generar token aleatorio fuera del chat, guardar original solo en el servidor consumidor y configurar SHA-256 del texto del token en SiteGround. No compartir el original ni el hash en esta conversación, fuentes, URLs, frontend o logs. Guardar variables en runtime y reiniciar según mecanismo verificado. NODE_ENV=production y excepción local deshabilitada.
3. Ejecutar matriz anterior por HTTPS con cliente seguro y verificar versión 2.0, alcance y errores. Si falla, retirar hash/reiniciar y volver al estado deshabilitado.
4. Con autorización de modificación del Site, almacenar URL fija/token en su runtime servidor y adaptar únicamente consultar_estadisticas_comerciales. Fetch servidor a servidor con timeout, tamaño limitado y redirecciones rechazadas; token nunca al navegador, argumentos/resultados MCP o logs. Validar 2.0 y respetar D024 y cobertura. Mantener audiencia privada y comprobar autorización del usuario MCP.
5. Probar una consulta y conciliación autorizada; mantener consultar_conocimiento_empresarial explícitamente ficticia/no disponible. Centro de conocimiento, API paga y escrituras fuera de alcance.

No se ejecutó ninguna de estas acciones de publicación, activación o conexión. El siguiente punto de autorización es el primer commit local; el push/deploy no quedan autorizados por aprobarlo.
