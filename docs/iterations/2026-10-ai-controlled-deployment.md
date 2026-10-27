# Iteración 9 — Preparación de publicación controlada, integración deshabilitada

## Modo SiteGround administrado — adaptación local del 27/10/2026

Estado aportado por el propietario: eca5414 publicado, CRM funcional e IA deshabilitada. La observación dio server_transport=tcp, peer unavailable, puerto local null, socket_tls=false, NODE_ENV=production, Host esperado y X-Forwarded-Proto=https incluso con valores falsificados en las tres pruebas. HTTPS público y redirección obligatoria comprobados. Esto supera la investigación de transporte pendiente de las secciones históricas siguientes, sin probar identidad criptográfica del proxy o aislamiento de todas sus rutas. No se requieren nuevos diagnósticos ni soporte para implementar esta opción explícita.

Cambio exclusivamente local: AI_READ_TRANSPORT_MODE tiene dos valores exactos. Ausente usa verified_peer; vacío o desconocido da 503/not_configured. verified_peer mantiene TLS real o proxy con IP autorizada, sin modificar la autenticación administrativa o el contrato 2.0. siteground_managed es opt-in y exige todas estas condiciones:

1. NODE_ENV=production y AI_READ_PUBLIC_ORIGIN HTTPS canónico, sin usuario, contraseña, ruta o barra final. No hay excepción local.
2. Host recibido exactamente igual al host/puerto del origen y X-Forwarded-Proto exactamente https; cadenas de protocolos, valores distintos o ausencia dan 403/https_required. No se utiliza req.secure como prueba ni se aceptan encabezados Passenger, Forwarded o X-Forwarded-Host como sustitutos.
3. remoteAddress realmente undefined, o una IP real incluida exactamente en AI_READ_TRUSTED_PROXY_IPS (normalización IPv4 mapeada conservada). Ausencia no significa una cadena vacía o unavailable; esos casos se rechazan. Una IP visible no autorizada también da 403, aunque envíe X-Forwarded-For, X-Real-IP o el protocolo correcto. No se infiere autorización desde server_transport=tcp ni desde la falta de metadatos.
4. Sin Origin, Cookie, Referer ni Sec-Fetch-Site/Mode/Dest/User; su presencia, incluso vacía, da 403/service_only. Son controles de uso servidor a servidor, no identificación infalible de navegadores.
5. Bearer de 64 caracteres hexadecimales minúsculos y comparación SHA-256/timingSafeEqual existente. Ausente/incorrecto da 401 bajo transporte válido. Una cookie administrativa nunca lo sustituye. Solo GET; los demás métodos dan 405 tras validar transporte y credencial. Rutas desconocidas permanecen 404, sin caer al CRM administrativo.

Configuración futura, solamente después de autorización independiente: NODE_ENV=production; AI_READ_TRANSPORT_MODE=siteground_managed; AI_READ_PUBLIC_ORIGIN=https://crm.prismacomunidad.com.ar; AI_READ_TRUSTED_PROXY_IPS vacío para el peer ausente observado; AI_READ_ALLOW_LOCAL_HTTP=false; PROXY_DIAGNOSTICS=false. AI_READ_TOKEN_SHA256 debe continuar AUSENTE hasta la habilitación expresamente autorizada. Sin hash válido, el modo nuevo tampoco habilita acceso: 503/not_configured, salvo que se haya agotado el límite de ingreso (429). No cambiar TRUST_PROXY administrativo ni usar comodines o IPs inventadas. Un cambio de variables requiere reiniciar todas las instancias. Volver a verified_peer deshabilita la excepción de peer ausente; retirar el hash revoca toda consulta.

Permanecen 120 solicitudes/minuto de ingreso, 30 consultas/minuto autorizadas, dos lecturas simultáneas y 512 KiB máximos por respuesta, no-store y errores sin detalles internos. Límites en memoria por proceso: varias instancias requieren límite compartido antes de habilitar. El contenido y las exclusiones personales de D024 no cambian.

Riesgo residual explícito: se confía en que el hosting aísla Node y que solo su proxy sobrescribe el protocolo y preserva el Host. La falta de remoteAddress no demuestra esto. Un actor que accediera directamente al adaptador ocultando el peer podría falsificar Host/XFP; aún necesitaría un token válido, pero la aplicación no podría acreditar HTTPS real ni impedir por sí sola un robo/replay del token en una ruta insegura. Las tres pruebas respaldan sobrescritura en las solicitudes observadas; no demuestran todas las rutas, instancias ni logs del proveedor. Se acepta o rechaza operativamente ese supuesto al revisar la habilitación; esta implementación no lo da por probado.

Alternativa sin IP: [HTTP Message Signatures, RFC 9421](https://datatracker.ietf.org/doc/html/rfc9421), con clave del consumidor, firma de método/destino/consulta (y Authorization si se conserva), expiración breve y nonce con protección compartida contra replay. Aporta prueba de posesión y vinculación a la solicitud más fuerte que una cabecera de protocolo, y limita la reutilización de una petición capturada. Es técnicamente viable en los servidores Node/consumidor HTTP, pero requiere implementación y rotación coordinadas y almacenamiento de nonces para múltiples procesos; no se incorpora a esta entrega. No cifra la respuesta ni demuestra HTTPS externo: sigue necesitando TLS y confianza en el borde. mTLS sería una alternativa para autenticar criptográficamente el canal si se termina en un ingreso controlado; su disponibilidad en este SiteGround no está acreditada, por lo que no es una solución inmediata demostrada. No introducir un segundo header estático como supuesto sustituto de estas pruebas.

Recomendación: opción aceptable para una habilitación posterior controlada del servicio privado si el propietario acepta explícitamente el supuesto de aislamiento del hosting, conserva HTTPS forzado, credencial aleatoria solo en runtime servidor, logs sin Authorization y límites adecuados al número de instancias. No equivale a confianza criptográfica de transporte; si se requiere esa garantía, mantener IA apagada hasta implementar un canal verificable. No se activó nada ni se modificaron DB, secretos, configuración productiva o herramientas MCP en esta adaptación.

Validación local: typecheck, lint, tests, build y diff check aprobados. Suite completa: 427 pruebas aprobadas, incluidas 56 del modo administrado, y 162 integraciones DB omitidas con todas sus banderas deshabilitadas. Peer ausente simulado únicamente en el arnés de pruebas; conexión TCP real no autorizada rechazada. Se verificaron configuración incompleta, headers falsificados, credenciales, métodos, marcadores de navegador, alcance de rutas, errores sin filtraciones, límites de ingreso/consulta, concurrencia y tamaño; las regresiones del modo anterior también pasaron. No representa prueba productiva del nuevo modo ni del aislamiento. Build con avisos conocidos de comentarios Zod/Rollup, sin errores.

## Observación del listener real — adaptación local del 27/10/2026

El propietario confirma producción funcional en 45a2626, IA deshabilitada con 503/not_configured y diagnóstico actualmente apagado. Informa peer unavailable, puerto local null, socket sin TLS, X-Forwarded-Proto https en las tres pruebas y Host coincidente; TCP 127.0.0.1:3001 rechazado. Estas observaciones no identifican por sí solas Unix ni Passenger. Superan las referencias históricas siguientes a publicación pendiente; no se realizaron nuevas pruebas productivas desde Codex.

Adaptación local: index.ts registra para la aplicación la misma instancia devuelta por app.listen(). Solo una petición administrativa válida y con marcador admitido consulta su server.address() y añade server_transport al JSONL privado. No registra dirección, familia, puerto o ruta devueltos por address(): únicamente tcp, unix o unknown. La consulta se realiza en la petición, no antes de listening. Se mantienen el destino privado, límites de diez minutos/doce registros, apagado por defecto y la API 2.0 intacta. No se añaden encabezados Passenger: no permiten acreditar origen por sí solos.

Según [Node.js 24, server.address()](https://nodejs.org/download/release/v24.20.0/docs/api/net.html#serveraddress), objeto con IP/familia/puerto representa TCP; string representa IPC. En Windows un string puede ser una named pipe y se clasifica unknown, no Unix. null, respuesta inválida, falta de registro o excepción permanecen unknown. La ausencia de remoteAddress nunca decide la clasificación. [Passenger documenta reverse port binding](https://www.phusionpassenger.com/docs/advanced_guides/in_depth/node/reverse_port_binding.html): puede sustituir el puerto solicitado por un Unix socket. Esto explica una posibilidad, no demuestra que sea el proveedor de esta instalación ni garantiza el aislamiento.

Después de un único despliegue futuro autorizado, con IA todavía apagada: el propietario activa temporalmente el diagnóstico sobre el directorio privado ya verificado, reinicia y ejecuta las tres peticiones autenticadas existentes dentro de la ventana. Leer solo las nuevas líneas por recorded_at y marcador; comprobar server_transport en las tres. Después apagar/reiniciar y limpiar según el procedimiento vigente. No se activó nada en esta intervención. Si el resultado es unknown, no declarar identificación concluyente ni habilitar IA; investigar el adaptador runtime. No insistir con puertos o inferir confianza desde un 503.

Uso posterior de la evidencia, sin implementar aún cambios de confianza:

- tcp: mantener TLS directo real o peer TCP exacto autorizado, origen/Host esperado y protocolo sobrescrito por el proxy; acreditar aislamiento y no aceptar valores del cliente. La categoría sola no identifica IPs autorizadas ni certifica HTTPS.
- unix: prueba del tipo de listener expuesto por address() bajo el contrato Node, no de identidad Passenger, exclusividad del proxy o HTTPS externo. Antes de habilitar un modo Unix explícito, verificar localmente propietario/permisos del socket y sus directorios (o controles equivalentes si el runtime oculta la ruta), qué procesos pueden conectarse y cómo el borde elimina/sobrescribe los metadatos de protocolo. Un socket Unix accesible por terceros tampoco es confiable. Con esa cadena acreditada podría diseñarse una guarda Unix específica con Host/origen y protocolo exactos, separada de IPs TCP. No aceptar todo peer ausente ni confiar en Passenger-Proto/encabezados especiales por mera presencia. Si no puede acreditarse la cadena, mantener IA apagada o usar un ingreso TLS autenticado verificable en una etapa autorizada.
- unknown: continuar rechazando transporte no acreditado con las reglas actuales; conservar IA apagada y obtener evidencia local adicional antes de diseñar una alternativa. No tratarlo como Unix por descarte.

Esta observación determina la categoría que devuelve el servidor HTTP del proceso; un adaptador que sustituya address() limita esa evidencia. No acredita todos los procesos/instancias o rutas del hosting ni sustituye los controles de aislamiento. Sin commits, publicación, cambios productivos o consultas DB en esta adaptación.

Validación local: typecheck, lint, tests, build y diff check satisfactorios; 371 pruebas aprobadas y 162 integraciones DB omitidas, con todas las banderas DB deshabilitadas. Quince casos nuevos cubren clasificación TCP/Unix/indeterminada, aislamiento por aplicación, consulta de listener TCP real y fallo seguro de address(). Unix se verificó con valores sintéticos del contrato Node, no con un socket Unix real del hosting. Build con los avisos conocidos de comentarios Zod/Rollup, sin errores.

Procedimiento vigente actualizado el 26/10/2026: diagnóstico adaptado a archivo privado porque SiteGround no expone stdout de Node. No autoriza commit, push, merge, deploy, configuración productiva ni conexión del Site. Contrato 2.0 y D024 intactos. La API falla cerrada sin AI_READ_TOKEN_SHA256. El diagnóstico sigue usando la sesión administrativa existente, apagado por defecto y sin endpoint público nuevo.

## Estado vigente al 26/10/2026

- Rama limpia al inicio de esta adaptación, HEAD f1dc7705df1229388270fda098565665aff65bfd. Conserva 22c0c1b y 501f5bb. El diagnóstico a stdout ya fue commiteado localmente en f1dc770; su adaptación a archivo privado queda sin commit y requiere revisión.
- Consulta remota de solo lectura: GitHub main sigue en bcf9f3f995150bf34c2db5750169a2851f21d1d9; rama de trabajo no publicada. No se hizo fetch ni se modificaron referencias locales.
- El propietario confirmó Forzar HTTPS activo y redirección HTTP satisfactoria. Esta confirmación posterior supera el HTTP 200 observado el 25/10. No se hicieron nuevas solicitudes a producción en esta intervención. La redirección no acredita confianza en los encabezados reenviados.
- Node.js 24, GitHub main y auto-deploy activo, según confirmación del propietario. AI_READ_* ausentes en producción, según propietario; no se accedió al panel ni se cambiaron variables. Entorno local comprobado: Node v24.21.0.

## Secuencia ejecutable mínima — aún no autorizada en producción

1. **Revisión y commit posteriores:** revisar los archivos de esta adaptación, validaciones y diff; solicitar autorización de commit local. A publicar: 501f5bb, 22c0c1b, f1dc770 y un futuro commit de adaptación a archivo que todavía no existe. No publicar archivos sin commit ni omitir esa revisión.
2. **Preflight del propietario:** comprobar rama main/auto-deploy, SHA activo y forma de reinicio en Site Tools. Mantener AI_READ_TOKEN_SHA256 ausente, NODE_ENV=production, APP_URL HTTPS, AI_READ_ALLOW_LOCAL_HTTP=false. Dejar PROXY_DIAGNOSTICS ausente/false para la primera publicación. No introducir secretos nuevos, copiar .env local ni modificar TRUST_PROXY para hacer pasar pruebas.
3. **Aprobación explícita del despliegue:** después de revisar GitHub de nuevo, integrar por fast-forward si sigue siendo posible y el propietario lo autoriza. El propietario realiza un único push a main, que dispara deploy. Si main remoto avanzó, detener y reevaluar; no forzar, rebasear ni resetear. No se ejecutó ningún paso Git de esta secuencia.
4. **Smoke deshabilitado:** verificar SHA/build, login y navegación administrativa habitual. Hacer solo peticiones anónimas, sin cookies, al endpoint IA: 503/not_configured y no-store, sin datos ni cookies nuevas. Una cookie administrativa no habilita IA. No ejecutar migraciones ni suites DB.
5. **Transporte externo sin secretos:** ejecutar los comandos de la sección siguiente. HTTP debe redirigir a HTTPS sin seguirlo automáticamente; HTTPS debe validar certificado. Los 503 de IA, con o sin X-Forwarded-Proto falsificado, NO prueban la sobrescritura: la guarda de configuración corre primero.
6. **Observación temporal opcional, con autorización de configuración no secreta:** establecer por SSH el directorio privado y verificar usuario, permisos, acceso y exclusión de raíces web según la sección siguiente. Solo entonces configurar PROXY_DIAGNOSTICS_DIR con la ruta física absoluta y PROXY_DIAGNOSTICS=true, y reiniciar usando el mecanismo confirmado. Sin ruta válida no se escribe; no hay fallback a stdout ni a otro directorio. No habilitar AI_READ_*.
7. **Pruebas del proxy desde sesión existente:** dentro de diez minutos desde crear la aplicación, ejecutar el fragmento indicado en el CRM HTTPS autenticado. Leer el JSONL privado por SSH; no publicar su contenido completo. No enviar cookies o tokens por HTTP ni exportar el almacén del navegador.
8. **Cierre:** desactivar PROXY_DIAGNOSTICS y reiniciar todas las instancias; comprobar ausencia de nuevas escrituras y eliminar los archivos exactos según la sección siguiente. IA permanece 503. Concluir qué se observó y qué quedó sin demostrar. No configurar el token ni conectar MCP hasta autorización posterior.

## Instrumentación temporal acotada

Integración existente: server/auth.ts valida sesión y llama al observador de server/proxy-diagnostics.ts. Solo se cambia el destino del registro por server/proxy-diagnostic-file.ts; se actualizan la plantilla .env.example, pruebas y procedimiento. No cambia auth.ts, app.ts, index.ts o ai-router.ts en esta adaptación. No hay rutas nuevas ni cambios de respuesta o contrato empresarial 2.0.

La sesión usa su comprobación de lectura existente en admin_sessions, sin consultas adicionales o escrituras propias del diagnóstico, y sin acceso a negocio. Nunca registra Cookie, Authorization, token, hashes, consultas, cuerpo, nombre de usuario, req.ip o X-Forwarded-For. No hace login por sí misma.

Solo admite marcadores públicos baseline/proto-http/proto-chain. Conserva los campos operativos ya aprobados del socket/proxy, protocolo interpretado, entorno acotado y comparación booleana de Host. Añade recorded_at UTC para distinguir lecturas. No registra la IP del cliente derivada de X-Forwarded-For, identidad de participantes ni contenido empresarial. Valores arbitrarios no se escriben. El peer es metadato operativo de infraestructura; el archivo sigue siendo privado y no garantiza anonimato si el peer resultara ser un cliente directo.

Máximo 12 registros por instancia de aplicación y solo durante diez minutos desde su creación; después no registra aunque la variable siga activa. Reiniciar con la variable activa reinicia la ventana: desactivarla explícitamente al terminar. Un fallo del destino de logs no altera autenticación ni respuesta. No genera logs para clientes anónimos o marcadores ausentes/desconocidos.

Retirada: fijar PROXY_DIAGNOSTICS=false, reiniciar todas las instancias y esperar el cierre de las escrituras ya iniciadas antes de eliminar archivos. Después retirar también PROXY_DIAGNOSTICS_DIR. La desactivación por sí sola no borra el archivo. Una retirada posterior de código requiere autorización: módulos de diagnóstico, import/creación/llamada en auth.ts y sus pruebas, sin alterar validación de sesión.

## Archivo privado: ubicación, lectura y limpieza

SiteGround documenta que la aplicación puede escribir un archivo propio y leerlo por SSH: https://www.siteground.com/academy/node-js-api-hosting. Esa capacidad NO determina ruta, UID o persistencia de esta cuenta. No se accedió al hosting ni se probó allí escritura.

Destino previsto: una carpeta dedicada .prisma-proxy-diagnostics dentro del área privada de la cuenta, FUERA del proyecto, builds, www, public_html, public, htdocs, wwwroot y dist. No se adopta automáticamente HOME, cwd o /tmp: el operador debe confirmar la raíz física privada y accesible al usuario Node antes de activar. Si no puede comprobar privacidad o permisos, detener el diagnóstico y mantenerlo apagado; no improvisar una ruta pública.

PROXY_DIAGNOSTICS_DIR debe ser absoluta, canónica y existir previamente. En Linux se exige propietario igual al UID del proceso y permisos 0700. Padres físicos sin escritura de grupo/otros y pertenecientes a root o al usuario de Node. No se crean directorios ni se corrigen permisos automáticamente. Se rechazan symlinks/alias y la carpeta no puede estar dentro ni ser antecesora de la aplicación. Windows falla cerrado porque el módulo no acredita ACL privadas mediante modos POSIX; no es necesario activar escritura local para validar Node.js 24.

Archivo fijo: proxy-diagnostics.jsonl, creado con 0600, solo regular, propietario correcto y un único enlace. Nunca seguir symlinks ni escribir hardlinks. Se serializan escrituras asíncronas, fuera del tiempo de respuesta; errores se absorben sin imprimir rutas, registros o excepciones y detienen el escritor hasta reiniciar. El límite original sigue siendo diez minutos/doce intentos por instancia. Además, un lock exclusivo y un tope de 64 KiB limitan el mismo archivo entre procesos y reinicios: al llenarse se deja de registrar, sin truncar, rotar ni crear archivos nuevos. Un lock residual tras caída detiene el registro hasta limpieza manual segura.

Preparación futura por SSH, solo tras autorización. Sustituir el marcador por una ruta física real previamente comprobada, no por el directorio público. No ejecutar estas instrucciones con el marcador literal:

```sh
DIAG_DIR='/RUTA_PRIVADA_VERIFICADA/.prisma-proxy-diagnostics'
pwd -P
id -u
umask 077
mkdir -m 700 -- "$DIAG_DIR"
realpath -- "$DIAG_DIR"
ls -ld -- "$DIAG_DIR"
```

mkdir se usa solo para una carpeta NUEVA dedicada, sin -p ni cambios recursivos. Si ya existe, inspeccionarla; no reemplazarla. Verificar que no exista publicación HTTP/alias del directorio y que los padres no sean escribibles por otros. El UID SSH no demuestra que sea el UID de Node: si difieren, solicitar un destino privado accesible al proceso sin relajar permisos. El archivo no se creará si falla esa comprobación. No copiar valores secretos del panel.

Tras configurar las dos variables de diagnóstico y reiniciar, enviar las tres peticiones autenticadas existentes. Luego consultar, sin un endpoint de descarga:

```sh
ls -l -- "$DIAG_DIR/proxy-diagnostics.jsonl"
wc -c -- "$DIAG_DIR/proxy-diagnostics.jsonl"
cat -- "$DIAG_DIR/proxy-diagnostics.jsonl"
```

Si el directorio aparece en Site Tools → Site → File Manager y el usuario tiene acceso privado, también puede abrirse allí. No asumir que el Gestor expone todos los directorios del usuario Node; SSH es la ruta documentada. No mover el archivo a public_html, dist/client, assets o un bucket público para poder leerlo.

Eliminación: primero apagar y reiniciar TODAS las instancias. Comprobar la ruta física, archivo regular y ausencia de symlinks; eliminar únicamente los dos nombres fijos, nunca un directorio recursivamente ni comodines. El lock solo se retira cuando no queda escritor activo:

```sh
realpath -- "$DIAG_DIR"
ls -la -- "$DIAG_DIR"
rm -i -- "$DIAG_DIR/proxy-diagnostics.jsonl"
rm -i -- "$DIAG_DIR/proxy-diagnostics.lock"
```

Es normal que el lock ya no exista. No se necesita eliminar la carpeta; rmdir únicamente si se verificó vacía y el propietario lo desea. Esta limpieza evita borrar otros archivos; no promete borrado forense de discos o respaldos de SiteGround. No se deja activado el diagnóstico mientras se elimina el registro, porque podría recrearlo.

Persistencia: el código agrega al archivo existente y no lo borra al reiniciar; esto se prueba con filesystem simulado. No está comprobado que SiteGround conserve la misma ruta/montaje entre reinicios o despliegues. Antes de depender de ello, registrar únicamente tamaño/fecha/inodo por SSH, reiniciar con diagnóstico apagado y volver a comprobar. Hacer una comprobación equivalente en el siguiente despliegue autorizado. Un directorio fuera de builds reduce dependencia de la versión, pero no prueba persistencia. La documentación de builds confirma que cada deploy crea archivos nuevos: https://www.siteground.com/kb/delete-node-js-builds. Si desaparece, no ampliar permisos ni buscar un fallback público; revisar montaje/acceso con el proveedor.

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

Desde herramientas de desarrollo del navegador, solo sobre https://crm.prismacomunidad.com.ar y con sesión administrativa ya válida, una vez preparado el directorio privado y activadas las dos variables de diagnóstico autorizadas:

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

El fragmento nunca lee o imprime cookies, no manipula Authorization ni muestra diagnósticos en la respuesta. Esperado: tres 200 con authenticated=true y tres líneas JSONL privadas correlacionadas por marcador/fecha. Un 200 no prueba que se haya podido escribir: verificar el archivo por SSH. Si no aparece, revisar ruta, UID/modos, padres, límite o lock residual, sin activar dumps ni imprimir secretos.

Lectura de resultados con TRUST_PROXY=1 (no modificarlo ahora):

- Baseline detrás de terminación TLS: socket_tls=false y forwarded_proto=https pueden ser correctos; peer es el proxy efectivo observado. Express puede interpretar https al confiar en un salto.
- Si los tres registros tienen forwarded_proto_exact_https=true pese a los valores falsos enviados, se observó normalización en la cadena ensayada. No demuestra todos los dominios, métodos, instancias o rutas de entrada.
- Si el marcador proto-http llega como http o proto-chain como http,https, la falsificación llegó a Node. Con un salto confiado, Express usa el primer protocolo reenviado; req.secure no acredita TLS real. No habilitar IA ni ampliar confianza; investigar ese camino.
- host_matches_app_url debe ser true en estas peticiones normales; false requiere aclarar Host/APP_URL, sin registrar valores arbitrarios.
- node_env debe ser production y trust_proxy_hops debe reflejar la configuración efectiva esperada. TRUST_PROXY=1 no valida identidad o estabilidad del proxy. La API de IA sigue comprobando socket/peers por separado.

## Qué puede y qué no puede probarse

| Método                                     | Evidencia posible                                                                                                     | Límite                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| HTTP/HTTPS externo sin secretos            | Certificado, redirect, 503 de IA, comportamiento HTTP frente a XFP ficticio                                           | No ve socket/Host real de Node ni demuestra aislamiento universal.                                           |
| Sesión autenticada + JSONL privado por SSH | Peer/puerto real, protocolo recibido, interpretación de Express y NODE_ENV en esas peticiones                         | No demuestra estabilidad futura ni persistencia del filesystem del proveedor.                                |
| TCP externo a un único IP/puerto conocido  | Si un listener es alcanzable en ese destino                                                                           | Un fallo no prueba firewall global; IP pública del dominio no equivale necesariamente al servidor de origen. |
| Configuración/proveedor                    | Aislamiento de red, peers estables o contrato de confianza, rutas alternativas, ubicación/redacción/retención de logs | No se puede concluir por una redirección o por tres peticiones exitosas.                                     |

No hacer escaneo. Solo con IP pública de origen y puerto reales confirmados por el panel/proveedor puede ejecutarse, con autorización, Test-NetConnection -ComputerName DIRECCION_CONFIRMADA -Port PUERTO_CONFIRMADO desde una red externa. No suponer PORT=3001 ni probar rangos. Si no se conoce ese destino, el aislamiento queda pendiente de SiteGround.

Authorization: no enviar secretos reales para comprobar logging. Revisar primero formato/redacción de access/error y del archivo propio. La ausencia de una cadena ficticia no garantiza todos los logs internos/retenciones del proveedor. La instrumentación propia excluye los campos por construcción y no tiene fallback stdout/stderr; sus pruebas verifican esa exclusión.

## Rollback concreto, sujeto a autorización posterior

- Mientras AI_READ_* siga ausente, no existe exposición de negocio por IA. Si solo falla el diagnóstico, PROXY_DIAGNOSTICS=false y reinicio lo desactivan; no hace falta revertir toda la API ni tocar DB.
- Antes del push registrar SHA productivo sano, rama vinculada y procedimiento de publicación del propietario. Si falla el build, comprobar qué versión sigue activa; no asumir que el proveedor conserva automáticamente la anterior.
- Si hay regresión administrativa, pausar auto-deploy solo con autorización del propietario y usar el mecanismo de restauración que SiteGround efectivamente ofrezca. No se presume un botón de rollback a partir de la pantalla de builds.
- Alternativa reproducible sin reescribir historia: con autorización y main actualizado, revertir primero el futuro commit de adaptación a archivo, luego f1dc770 y después 22c0c1b, creando nuevos commits locales de reversión; push manual del propietario tras revisión. 501f5bb se conserva. Ante cambios posteriores o conflictos, detener y revisar. Sin reset, force push, rebase o rollback SQL. El archivo fuera del build no se borra al revertir código: limpiar por SSH con todos los escritores apagados.
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

Rollback mediante nuevos commits, si se autoriza y no hay cambios posteriores incompatibles: en main limpio y actualizado, sustituir el marcador por el SHA completo real del futuro commit de adaptación a archivo, todavía inexistente:

```powershell
git revert --no-commit SHA_COMPLETO_ADAPTACION_ARCHIVO f1dc7705df1229388270fda098565665aff65bfd 22c0c1be64b27e9c431b534e0e7d4d2604bb433e
git commit -m "revert: roll back AI integration deployment"
```

Revisar y validar la reversión antes del único push manual del propietario. Si el revert devuelve conflicto, detenerse antes del commit y resolver con revisión; no continuar automáticamente. No ejecutar migraciones, reset, rebase ni force push. No se ejecutó ningún comando de publicación/reversión en esta preparación.

## Antecedente de validación del diagnóstico a stdout, 26/10/2026

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

Un timeout al puerto desde una sola ubicación no prueba aislamiento universal: complementar con confirmación del proveedor. No hay endpoint público nuevo; la observación vigente escribe campos acotados en el JSONL privado tras validar sesión. No utiliza stdout. Si la plataforma no puede garantizar la cadena o un directorio privado, detener habilitación de esa parte.

## Habilitación y conexión real posteriores

1. Elegir explícitamente el transporte según la sección vigente: verified_peer requiere peers verificables; siteground_managed usa la evidencia aportada y exige aceptar su supuesto residual de aislamiento, sin más diagnósticos. Confirmar HTTPS forzado, ausencia de credenciales en logs y número de instancias. Varias instancias necesitan rate limit compartido antes de habilitar. Confirmar AI_READ_PUBLIC_ORIGIN=https://crm.prismacomunidad.com.ar y configuración de peers/mode correspondiente, sin inventar IPs.
2. Con autorización, generar token aleatorio fuera del chat, guardar original solo en el servidor consumidor y configurar SHA-256 del texto del token en SiteGround. No compartir el original ni el hash en esta conversación, fuentes, URLs, frontend o logs. Guardar variables en runtime y reiniciar según mecanismo verificado. NODE_ENV=production y excepción local deshabilitada.
3. Ejecutar matriz anterior por HTTPS con cliente seguro y verificar versión 2.0, alcance y errores. Si falla, retirar hash/reiniciar y volver al estado deshabilitado.
4. Con autorización de modificación del Site, almacenar URL fija/token en su runtime servidor y adaptar únicamente consultar_estadisticas_comerciales. Fetch servidor a servidor con timeout, tamaño limitado y redirecciones rechazadas; token nunca al navegador, argumentos/resultados MCP o logs. Validar 2.0 y respetar D024 y cobertura. Mantener audiencia privada y comprobar autorización del usuario MCP.
5. Probar una consulta y conciliación autorizada; mantener consultar_conocimiento_empresarial explícitamente ficticia/no disponible. Centro de conocimiento, API paga y escrituras fuera de alcance.

La integración está guardada en 22c0c1b y el diagnóstico anterior a stdout en f1dc770. La adaptación actual a archivo privado no está commiteada. No se ejecutaron publicación, activación o conexión; requieren autorización posterior independiente.

## Validación local de la adaptación a archivo privado, 26/10/2026

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` y `git diff --check`: satisfactorios. Suite completa: 356 pruebas aprobadas y 162 omitidas; todas las banderas de integración DB se mantuvieron deshabilitadas. No se consultó ni modificó ninguna base de datos.
- El build emitió advertencias de Rollup sobre anotaciones de comentarios en Zod, sin impedir su finalización.
- Las pruebas nuevas simulan metadatos y operaciones POSIX: directorios privados, permisos/propietario, enlaces, exclusión mediante lock, límite acumulado, continuidad entre escritores y fallos de escritura sin salida a consola. La ejecución local fue en Windows: no verifica permisos Linux reales ni almacenamiento de SiteGround.
- Se conservan las pruebas de diagnóstico apagado por defecto, sesión administrativa obligatoria, respuestas administrativas intactas, diez minutos, doce registros y exclusión de encabezados sensibles. No se alteraron la API empresarial 2.0 ni D024.
- Siguen pendientes la comprobación manual de ruta privada y usuario de Node, escritura efectiva y persistencia durante reinicios/despliegues. No se eligió una ruta productiva ni se configuraron variables en SiteGround. Primera publicación preparada con IA y diagnóstico deshabilitados, sujeta a revisión y autorización del propietario.
