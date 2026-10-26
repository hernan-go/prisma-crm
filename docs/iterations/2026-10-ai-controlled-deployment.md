# Iteración 9 — Preparación de publicación controlada, integración deshabilitada

Procedimiento vigente actualizado el 26/10/2026. No autoriza commit, push, merge, deploy, cambios productivos de configuración ni conexión del Site. Contrato empresarial 2.0 y D024 intactos. La API ya falla cerrada sin AI_READ_TOKEN_SHA256. La única ampliación local es una observación temporal en logs privados, mediante la sesión administrativa existente y apagada por defecto, para medir el proxy sin un endpoint público nuevo.

## Estado vigente al 26/10/2026

- Rama limpia al inicio, HEAD 22c0c1be64b27e9c431b534e0e7d4d2604bb433e, padre 501f5bb4301d6bdb4931e1122cde6d7c5a97c85a. Ambos se conservan. La instrumentación y este procedimiento quedan sin commit y requieren revisión antes de versionarse.
- Consulta remota de solo lectura: GitHub main sigue en bcf9f3f995150bf34c2db5750169a2851f21d1d9; rama de trabajo no publicada. No se hizo fetch ni se modificaron referencias locales.
- El propietario confirmó Forzar HTTPS activo y redirección HTTP satisfactoria. Esta confirmación posterior supera el HTTP 200 observado el 25/10. No se hicieron nuevas solicitudes a producción en esta intervención. La redirección no acredita confianza en los encabezados reenviados.
- Node.js 24, GitHub main y auto-deploy activo, según confirmación del propietario. AI_READ_* ausentes en producción, según propietario; no se accedió al panel ni se cambiaron variables. Entorno local comprobado: Node v24.21.0.

## Secuencia ejecutable mínima — aún no autorizada en producción

1. **Revisión y commit posteriores:** revisar únicamente los archivos temporales descritos abajo, validaciones y diff; solicitar autorización de commit local. Actualmente el conjunto a publicar contiene los commits 501f5bb y 22c0c1b, más un futuro commit de diagnóstico/procedimiento que todavía no existe. No publicar archivos sin commit ni omitir esa revisión.
2. **Preflight del propietario:** comprobar rama main/auto-deploy, SHA activo y forma de reinicio en Site Tools. Mantener AI_READ_TOKEN_SHA256 ausente, NODE_ENV=production, APP_URL HTTPS, AI_READ_ALLOW_LOCAL_HTTP=false. Dejar PROXY_DIAGNOSTICS ausente/false para la primera publicación. No introducir secretos nuevos, copiar .env local ni modificar TRUST_PROXY para hacer pasar pruebas.
3. **Aprobación explícita del despliegue:** después de revisar GitHub de nuevo, integrar por fast-forward si sigue siendo posible y el propietario lo autoriza. El propietario realiza un único push a main, que dispara deploy. Si main remoto avanzó, detener y reevaluar; no forzar, rebasear ni resetear. No se ejecutó ningún paso Git de esta secuencia.
4. **Smoke deshabilitado:** verificar SHA/build, login y navegación administrativa habitual. Hacer solo peticiones anónimas, sin cookies, al endpoint IA: 503/not_configured y no-store, sin datos ni cookies nuevas. Una cookie administrativa no habilita IA. No ejecutar migraciones ni suites DB.
5. **Transporte externo sin secretos:** ejecutar los comandos de la sección siguiente. HTTP debe redirigir a HTTPS sin seguirlo automáticamente; HTTPS debe validar certificado. Los 503 de IA, con o sin X-Forwarded-Proto falsificado, NO prueban la sobrescritura: la guarda de configuración corre primero.
6. **Observación temporal opcional, con autorización de configuración no secreta:** primero verificar que el propietario puede leer stdout runtime privado. Node.js → Logs puede mostrar solo builds; no asumir que contiene stdout de la aplicación. Si el panel no expone esos logs, solicitar a SiteGround ubicación/acceso y detener esta parte; no publicar un visor HTTP de logs. Solo entonces activar PROXY_DIAGNOSTICS=true y reiniciar usando el mecanismo confirmado, sin habilitar AI_READ_*.
7. **Pruebas del proxy desde sesión existente:** dentro de diez minutos desde crear la aplicación, ejecutar el fragmento de consola indicado abajo en el CRM HTTPS ya autenticado. Revisar únicamente registros proxy_diagnostic privados. No enviar cookies ni tokens por HTTP, no cambiar Host ni exportar el almacén de sesión del navegador.
8. **Cierre:** desactivar PROXY_DIAGNOSTICS y reiniciar; repetir marcador y comprobar que no genera registros. IA permanece 503. Concluir qué peers/protocolo/Host se observaron y qué quedó sin demostrar. No configurar el token ni conectar MCP hasta autorización posterior.

## Instrumentación temporal acotada

Archivos: nuevo server/proxy-diagnostics.ts; dos puntos de integración en server/auth.ts (crear observador y llamarlo desde GET /api/auth/session únicamente después de validar sesión); plantilla .env.example con PROXY_DIAGNOSTICS=false; tests/proxy-diagnostics.test.ts. server/app.ts, server/index.ts y ai-router.ts no requieren cambios. No hay ruta nueva ni cambios en la respuesta de sesión o contrato empresarial 2.0.

La sesión usa su comprobación de lectura existente en admin_sessions, sin consultas adicionales o escrituras propias del diagnóstico, y sin acceso a negocio. Nunca registra Cookie, Authorization, token, hashes, consultas, cuerpo, nombre de usuario, req.ip o X-Forwarded-For. No hace login por sí misma.

Solo admite marcadores públicos baseline/proto-http/proto-chain. Registra peer real del socket y puerto local, TLS real del socket, clasificación acotada de X-Forwarded-Proto y si es exactamente https, protocolo/secure interpretados por Express, trust proxy numérico, NODE_ENV limitado a production/development/test/other y booleano de Host coincidente con APP_URL. Valores arbitrarios de Host/protocolo/entorno no se imprimen. Las IP observadas son operativas y quedan exclusivamente en logs privados, nunca en la respuesta HTTP. Requiere controlar acceso y retención de esos logs.

Máximo 12 registros por instancia de aplicación y solo durante diez minutos desde su creación; después no registra aunque la variable siga activa. Reiniciar con la variable activa reinicia la ventana: desactivarla explícitamente al terminar. Un fallo del destino de logs no altera autenticación ni respuesta. No genera logs para clientes anónimos o marcadores ausentes/desconocidos.

Retirada: quitar la variable o fijarla en false y reiniciar; no es necesario modificar código para detener la captura. Posteriormente, en un cambio autorizado, retirar el módulo, su import/creación/llamada en auth.ts, la variable de ejemplo y sus pruebas. No alterar la lógica de validación de sesión. El procedimiento y evidencias pueden conservarse como historial.

## Pruebas exactas con el despliegue deshabilitado

Sin credenciales, ejecutar desde fuera del hosting (no se ejecutaron ahora):

```powershell
curl.exe --silent --show-error --max-time 15 --proto =http --output NUL --write-out 'status=%{http_code} redirect=%{redirect_url}\n' http://crm.prismacomunidad.com.ar/
curl.exe --silent --show-error --max-time 15 --proto =https --output NUL --write-out 'status=%{http_code} tls=%{ssl_verify_result}\n' https://crm.prismacomunidad.com.ar/
curl.exe --silent --show-error --max-time 15 --proto =https --include 'https://crm.prismacomunidad.com.ar/api/integrations/ai/monthly-context?period=2026-10'
curl.exe --silent --show-error --max-time 15 --proto =https --include --header 'X-Forwarded-Proto: http' 'https://crm.prismacomunidad.com.ar/api/integrations/ai/monthly-context?period=2026-10'
curl.exe --silent --show-error --max-time 15 --proto =http --output NUL --header 'X-Forwarded-Proto: https' --write-out 'status=%{http_code} redirect=%{redirect_url}\n' http://crm.prismacomunidad.com.ar/
```

Esperado: HTTP 301/302/307/308 a HTTPS, certificado HTTPS válido y 503/not_configured en las dos peticiones IA. No seguir redirects con Authorization. Esta fase no permite comprobar 401/200 del token, que se posponen hasta autorizar credenciales; su comportamiento está cubierto localmente. El HTTPS público ya fue confirmado por el propietario, pero repetirlo después del deploy verifica regresiones.

Desde herramientas de desarrollo del navegador, solo sobre https://crm.prismacomunidad.com.ar y con sesión administrativa ya válida, una vez activados los logs temporales autorizados:

```javascript
for (const [probe, forwarded] of [
  ['baseline', null],
  ['proto-http', 'http'],
  ['proto-chain', 'http,https'],
]) {
  const headers = { 'X-Proxy-Check': probe };
  if (forwarded) headers['X-Forwarded-Proto'] = forwarded;
  const response = await fetch('/api/auth/session', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
  });
  const session = await response.json();
  console.log({ probe, status: response.status, authenticated: session.authenticated });
}
```

El fragmento nunca lee o imprime cookies, no manipula Authorization ni muestra diagnósticos en la respuesta. Solo accede a la sesión ya existente. Esperado: tres 200 con authenticated=true y tres registros privados correlacionados por marcador. Si un navegador/proxy elimina la cabecera de prueba antes del origen, confirmar el envío en Network (sin copiar Cookie ni Authorization); una observación aislada no identifica qué salto la eliminó.

Lectura de resultados con TRUST_PROXY=1 (no modificarlo ahora):

- Baseline detrás de terminación TLS: socket_tls=false y forwarded_proto=https pueden ser correctos; peer es el proxy efectivo observado. Express puede interpretar https al confiar en un salto.
- Si los tres registros tienen forwarded_proto_exact_https=true pese a los valores falsos enviados, se observó normalización en la cadena ensayada. No demuestra todos los dominios, métodos, instancias o rutas de entrada.
- Si el marcador proto-http llega como http o proto-chain como http,https, la falsificación llegó a Node. Con un salto confiado, Express usa el primer protocolo reenviado; req.secure no acredita TLS real. No habilitar IA ni ampliar confianza; investigar ese camino.
- host_matches_app_url debe ser true en estas peticiones normales; false requiere aclarar Host/APP_URL, sin registrar valores arbitrarios.
- node_env debe ser production y trust_proxy_hops debe reflejar la configuración efectiva esperada. TRUST_PROXY=1 no valida identidad o estabilidad del proxy. La API de IA sigue comprobando socket/peers por separado.

## Qué puede y qué no puede probarse

| Método                                       | Evidencia posible                                                                                                     | Límite                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| HTTP/HTTPS externo sin secretos              | Certificado, redirect, 503 de IA, comportamiento HTTP frente a XFP ficticio                                           | No ve socket/Host real de Node ni demuestra aislamiento universal.                                           |
| Sesión autenticada + stdout privado temporal | Peer/puerto real, protocolo recibido, interpretación de Express y NODE_ENV en esas peticiones                         | No identifica con certeza la marca/topología del proxy, su estabilidad futura o todos los caminos.           |
| TCP externo a un único IP/puerto conocido    | Si un listener es alcanzable en ese destino                                                                           | Un fallo no prueba firewall global; IP pública del dominio no equivale necesariamente al servidor de origen. |
| Configuración/proveedor                      | Aislamiento de red, peers estables o contrato de confianza, rutas alternativas, ubicación/redacción/retención de logs | No se puede concluir por una redirección o por tres peticiones exitosas.                                     |

No hacer escaneo. Solo con IP pública de origen y puerto reales confirmados por el panel/proveedor puede ejecutarse, con autorización, Test-NetConnection -ComputerName DIRECCION_CONFIRMADA -Port PUERTO_CONFIRMADO desde una red externa. No suponer PORT=3001 ni probar rangos. Si no se conoce ese destino, el aislamiento queda pendiente de SiteGround.

Authorization: no enviar secretos reales para comprobar logging. Revisar primero formato y redacción de access/error/stdout. Puede usarse una cadena ficticia y pública marcada como tal por HTTPS y buscarla localmente en los registros sin publicarlos. Su ausencia no garantiza todos los logs internos/retenciones del proveedor; esa propiedad requiere confirmación o política del hosting. La instrumentación local excluye los campos por construcción y sus pruebas verifican esa exclusión.

## Rollback concreto, sujeto a autorización posterior

- Mientras AI_READ_* siga ausente, no existe exposición de negocio por IA. Si solo falla el diagnóstico, PROXY_DIAGNOSTICS=false y reinicio lo desactivan; no hace falta revertir toda la API ni tocar DB.
- Antes del push registrar SHA productivo sano, rama vinculada y procedimiento de publicación del propietario. Si falla el build, comprobar qué versión sigue activa; no asumir que el proveedor conserva automáticamente la anterior.
- Si hay regresión administrativa, pausar auto-deploy solo con autorización del propietario y usar el mecanismo de restauración que SiteGround efectivamente ofrezca. No se presume un botón de rollback a partir de la pantalla de builds.
- Alternativa reproducible sin reescribir historia: con autorización y main actualizado, revertir primero el futuro commit de diagnóstico y después 22c0c1b, creando nuevos commits locales de reversión; push manual del propietario una vez revisados. 501f5bb se conserva. Si hay commits posteriores relacionados o conflictos, detener y resolver antes del push. No usar reset, force push o rebase. No hay rollback SQL porque no hay migraciones ni cambios DB.
- Después verificar SHA/build, login, navegación, IA ausente/deshabilitada y logs temporales apagados. La activación del token y la conexión MCP siguen en una autorización separada.

Comandos de referencia para el propietario, **solo después de autorizar commit e integración/publicación** y con árbol limpio. Primero volver a consultar main remoto y detenerse si ya no es el SHA revisado; no usar estos comandos para resolver divergencias:

```powershell
git status -sb
git ls-remote --heads origin main
git switch main
git merge --ff-only codex/iteration-9-ai-read-context
```

Revisar el HEAD resultante, confirmar la integración deshabilitada en runtime y obtener autorización de publicación. Solo entonces el propietario ejecutaría:

```powershell
git push origin main
```

Rollback mediante nuevos commits, si se autoriza y no existen cambios posteriores incompatibles: en main limpio y actualizado, sustituir el marcador por el SHA completo real del futuro commit de diagnóstico. No hay todavía un valor para ese marcador:

```powershell
git revert --no-commit SHA_COMPLETO_DIAGNOSTICO 22c0c1be64b27e9c431b534e0e7d4d2604bb433e
git commit -m "revert: roll back AI integration deployment"
```

Revisar y validar la reversión antes del único push manual del propietario. Si el revert devuelve conflicto, detenerse antes del commit y resolver con revisión; no continuar automáticamente. No ejecutar migraciones, reset, rebase ni force push. No se ejecutó ningún comando de publicación/reversión en esta preparación.

## Validación local del diagnóstico, 26/10/2026

Typecheck y lint aprobados; 338 pruebas normales aprobadas, incluidas ocho pruebas nuevas de instrumentación; 162 integraciones DB omitidas. Se fijaron explícitamente en false todas las banderas de suites DB. La pasada focalizada de autenticación, IA y diagnóstico pasó 65 pruebas. Build completo aprobado sobre Node v24.21.0, con avisos conocidos no bloqueantes de anotaciones Zod/Rollup. git diff --check aprobado. No se repitieron consultas económicas, no hubo conexión DB ni solicitudes a producción.

Cambios locales limitados a server/auth.ts, server/proxy-diagnostics.ts, tests/proxy-diagnostics.test.ts, .env.example y este procedimiento. Sin dependencias, cambios del contrato 2.0, política D024, endpoints nuevos, secretos o modificaciones del .env real. HEAD sigue en 22c0c1b y conserva 501f5bb como padre; cambios nuevos sin commit. Se puede autorizar la primera publicación deshabilitada después de revisar/versionar estos cambios y confirmar el hash ausente; la confianza de proxy y activación de IA requieren sus comprobaciones separadas.

## Evidencia histórica del 25/10/2026

Los puntos siguientes son antecedentes anteriores al commit local y a la activación de Forzar HTTPS. No reemplazan el estado vigente descrito arriba.

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
3. Security → SSL Manager y HTTPS Enforce: certificado/dominio correcto y estado de imposición HTTPS. El propietario ya confirmó su activación posterior; comprobar regresiones después del deploy. Nunca transmitir un token por HTTP aunque luego haya redirección.
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

Un timeout al puerto desde una sola ubicación no prueba aislamiento universal: complementar con confirmación del proveedor. No hay endpoint público nuevo; la observación temporal vigente usa solo campos acotados en stdout privado tras validar la sesión existente. Si la plataforma no puede garantizar la cadena, detener habilitación.

## Habilitación y conexión real posteriores

1. Completar verificaciones de proxy, HTTP/HTTPS, aislamiento, logs y número de instancias. Varias instancias necesitan rate limit compartido antes de habilitar. Confirmar valores sin secretos de AI_READ_PUBLIC_ORIGIN=https://crm.prismacomunidad.com.ar y peers exactos de AI_READ_TRUSTED_PROXY_IPS.
2. Con autorización, generar token aleatorio fuera del chat, guardar original solo en el servidor consumidor y configurar SHA-256 del texto del token en SiteGround. No compartir el original ni el hash en esta conversación, fuentes, URLs, frontend o logs. Guardar variables en runtime y reiniciar según mecanismo verificado. NODE_ENV=production y excepción local deshabilitada.
3. Ejecutar matriz anterior por HTTPS con cliente seguro y verificar versión 2.0, alcance y errores. Si falla, retirar hash/reiniciar y volver al estado deshabilitado.
4. Con autorización de modificación del Site, almacenar URL fija/token en su runtime servidor y adaptar únicamente consultar_estadisticas_comerciales. Fetch servidor a servidor con timeout, tamaño limitado y redirecciones rechazadas; token nunca al navegador, argumentos/resultados MCP o logs. Validar 2.0 y respetar D024 y cobertura. Mantener audiencia privada y comprobar autorización del usuario MCP.
5. Probar una consulta y conciliación autorizada; mantener consultar_conocimiento_empresarial explícitamente ficticia/no disponible. Centro de conocimiento, API paga y escrituras fuera de alcance.

El primer commit local fue autorizado y creado posteriormente en 22c0c1b. Los cambios temporales nuevos del 26/10 no están commiteados. No se ejecutaron publicación, activación o conexión; requieren autorización posterior independiente.
