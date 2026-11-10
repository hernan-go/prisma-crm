# Iteración 12.2.B3 — login Google individual

## Iteración 12.2 — aceptación funcional local aprobada (10/11/2026)

El propietario confirmó en navegador real sobre prisma_test el ingreso Google de Hernán y Jesica con identidad correcta y Dashboard accesible. Ambos cerraron sesión y el acceso posterior al Dashboard quedó bloqueado. Dos cuentas Google no autorizadas fueron rechazadas. La corrección local devuelve HTTP 303 a /login?google=denied y presenta el mensaje comprensible, sin acceso administrativo. Esta evidencia corresponde a los recorridos informados por el propietario.

020.sql fue aplicada y verificada exclusivamente en prisma_test, después de respaldo completo verificado por tamaño, salida exitosa y SHA-256. La restauración del respaldo no fue probada. Las identidades y vinculaciones institucionales permanecieron intactas y el acceso legacy se conserva. La revocación administrativa manual mediante CLI todavía no fue comprobada.

Bloques 1–5 publicados en la rama codex/iteration-12-identity-foundations hasta b260677c8af903ad22ecb5a33d5fa3513b17dd1c. Actions #73 aprobó 729 pruebas sin MySQL y 251 integraciones MySQL. La corrección posterior de experiencia de rechazo tuvo 21 pruebas focalizadas aprobadas, typecheck, lint, build y diff-check correctos. En este cierre se actualiza documentación y se prepara un único commit de la corrección con su CI remota pendiente de verificar sobre el nuevo SHA. No se repiten suites locales ya aprobadas.

**Aceptación funcional local aprobada.** Permanecen pendientes la comprobación manual de revocación administrativa, integración autorizada a main, respaldo/preflight y preparación de migraciones/configuración productivas, despliegue y aceptación productiva. Antes de habilitar producción se debe verificar allí el estado de migraciones e intentos históricos consumidos sin asociación. La retirada del acceso compartido requiere decisión expresa posterior. No se realizaron operaciones productivas en este cierre.

Los apartados siguientes conservan antecedentes de implementación y validación. Sus menciones de aceptación local, migración 020 en prisma_test o pruebas de navegador pendientes quedan superadas únicamente por los resultados anteriores.

## Bloques 4 y 5 — entrega local 10/11/2026

Base inicial verificada: rama `codex/iteration-12-identity-foundations`, HEAD `537c573cd5fc6d344427b6173ba1c3a5f893f43d`, sin cambios locales. El pedido confirma publicación de Bloques 1–3 y Actions #70, #71 y #72 aprobados; B3 cerró con 700 pruebas sin MySQL y 251 integraciones MySQL. Esa confirmación supera el estado histórico de publicación pendiente inferior. No se reiteraron auditorías, investigación de concurrencia ni integraciones cerradas.

Plan aplicado en esta sesión: (1) ampliar únicamente `server/identity-cli.ts` con confirmación específica y pruebas de recuperación; (2) integrar Google/sesión/logout en `client/Auth.tsx`, contrato tipado y eventos en `client/api.ts`, estilos acotados y pruebas sintéticas; (3) actualizar estos documentos, ejecutar controles y revisar el diff. Sin archivos adicionales de planificación, nuevas capas, endpoints, migraciones o dependencias.

### Bloque 4 — recuperación administrativa

Comando operativo, **solo después de autorizar el destino real**:

```powershell
npm run identity:admin -- revoke-sessions <base_verificada> <UUID_usuario>
```

`DB_NAME` debe coincidir con la base escrita en el comando. La CLI conserva el preflight existente que coteja `SELECT DATABASE()`, migraciones 017–019 y estructura de identidad; no exige Google habilitado ni 020 para revocar. Requiere stdin y stdout TTY, acceso privilegiado al proceso/DB y esta frase exacta, sin opciones no interactivas:

```text
CONFIRM <base_verificada> revoke-sessions <UUID_usuario>
```

Valida aridad/UUID y vuelve a verificar la conexión después de la confirmación. Llama `revokeIdentitySessions(userId, null)` sin otro servicio: usuario existente bajo bloqueo, todas sus sesiones individuales revocadas y evento `sessions.revoked` en la misma transacción. `actor_id=NULL` representa la operación local privilegiada, sin atribuir identidad del sistema operativo no verificada. Repetir conserva la revocación y registra el nuevo acto; no cambia otras identidades ni vínculos Google. La salida de este comando solo confirma éxito después del commit y no contiene tokens, hashes ni secretos. Un error de existencia/preflight/DB no produce confirmación de éxito; el entrypoint mantiene su error público genérico y código de salida 1.

Pruebas CLI: comando válido/repetición, confirmación incorrecta o incompleta, UUID/aridad, terminal no interactiva, destino omitido/distinto, cambio de destino mientras se confirma, inexistencia y fallo DB simulado. Se usa un doble del servicio ya probado en B3; **no es una nueva ejecución MySQL de revocación**. El contrato individual/masivo y la auditoría siguen en el servicio preexistente sin modificaciones; no se reabren sus pruebas cerradas. No se ejecutó el comando sobre datos reales.

El acceso compartido permanece durante la transición. Revocar sesiones individuales no impide nuevos logins de un usuario habilitado ni invalida la contraseña compartida: ante compromiso de credenciales/vínculo se necesita la operación supervisada correspondiente. No se presenta la permanencia de legacy como recuperación definitiva ni se lo retira automáticamente.

### Bloque 5 — interfaz de autenticación

Google se muestra solo si `/api/auth/session` entrega `googleLogin.available=true` y CSRF. El formulario tiene `method=post`, `action=/api/auth/google/login/start` y campo oculto `csrf`; no intercepta submit ni usa fetch para iniciar OAuth. Conserva POST/Origin/CSRF/303/callback/cookies del backend sin modificaciones. La sesión `authenticated=true` permite entrar también con `configured=false` (solo indica configuración legacy). El nombre de identidad aparece junto a logout, tanto en sidebar como en menú móvil mediante el componente compartido existente.

La contraseña queda en un formulario separado rotulado «Acceso compartido temporal», cuando el servidor informa configuración legacy disponible. Un fallo Google no inicia legacy automáticamente. Credencial inválida, 401 y conflicto 409 ofrecen verificación/logout antes de mostrar métodos; 503 o fallo de consulta muestra indisponibilidad y reintento. Un 409/503 de una operación de negocio pide consultar sesión: si sigue válida se mantiene el acceso; no se interpreta ese código aislado como conflicto de autoridades. Un error de reconsulta no permite usar datos autenticados anteriores como autoridad. El 401 de contraseña incorrecta conserva la corrección del formulario legacy y borra la contraseña.

Login legacy y logout exitosos cancelan consultas, retiran caché privada y reinician la consulta de autenticación. Logout falla visible y no declara cierre ni limpia caché si el backend rechaza la revocación. No hay tokens de sesión en el frontend, almacenamiento local de credenciales, nuevos endpoints ni cambios en roles, vinculación supervisada, correlación B3 o vencimiento absoluto de ocho horas. Estilos usan los colores y la estructura actuales, con nombres largos ajustables y controles HTML accesibles.

Pruebas de renderizado y handlers: disponibilidad Google/CSRF, contrato nativo del formulario, identidad válida/nombre sin legacy obligatorio, compatibilidad legacy, 401/409/503, errores de negocio con sesión válida, login explícito y limpieza de contraseña, logout exitoso/fallido y reinicio de caché. Los hooks React/TanStack se simulan: cubren ramas/contratos, **no acreditan montaje en navegador, envío HTTP real, redirección Google ni efectos completos del caché real**.

### Validación y límites

Pruebas focalizadas previas al formato: **33 aprobadas, cero fallidas**, 15 CLI y 18 interfaz. Se observaron fallos antes de implementar los requisitos nuevos y el borde sin CSRF. La primera suite completa detectó una regresión de renderizado SSR (`window` ausente al emitir el nuevo evento 503); corregida con detección de entorno antes de eventos, sin alterar la prueba existente.

Controles finales después de formato: **typecheck, lint, build y diff-check aprobados**; suite completa sin MySQL **729 aprobadas, cero fallidas y 305 omitidas** (54 archivos aprobados, 15 omitidos). Las omisiones no son aceptación DB. Avisos conocidos Rollup/Zod y conversión LF→CRLF, sin cambiar configuración Git. Revisión independiente del diff B4/B5 sin defectos materiales confirmados; remarca el límite de hooks simulados. No se ejecutan integraciones MySQL nuevas porque los cambios solo componen servicios/contratos existentes; no se crea infraestructura ni se aplican migraciones. No se accede a bases conservadas ni producción. El EPERM inicial de caché Vitest en sandbox requirió ejecución autorizada fuera del sandbox mediante `test:unit`, con todas las flags MySQL deshabilitadas por el runner.

**Dictamen: APTO para revisión y eventual commit local; PENDIENTE para aceptación visual/Google real y habilitación operativa.** Ocho archivos modificados y uno nuevo (`tests/auth-ui.test.tsx`); índice vacío, HEAD intacto. Sin staging, commits, push, merge, PR ni despliegue. Se revirtió únicamente el reformateo ajeno al alcance que Prettier había introducido en la tabla histórica del roadmap.

**Aceptación visual real pendiente**, conforme al alcance solicitado y WORKFLOW §7: no se inició backend, MySQL ni navegador contra datos conservados. Cuando exista entorno habilitado, revisar escritorio 1440×900, tablet 768×1024 y móvil 390×844, teclado/foco/etiquetas, nombre largo, carga, error, Google disponible/no disponible, sesión vencida, conflicto y cierre/reintento; inspeccionar consola/red. Estas comprobaciones no quedan sustituidas por SSR ni por build.

### Primera prueba manual con Google — autorización posterior necesaria

1. Elegir y autorizar expresamente el entorno/DB. No usar una suite destructiva en las cuatro bases conservadas. Preparar respaldo/preflight y aplicar `020.sql` de manera controlada según WORKFLOW §8, verificando registro y estructura. 017–019 son inmutables; no repetir bootstrap ni modificar las vinculaciones reales.
2. Verificar con lectura autorizada si existen intentos login consumidos sin `issued_session_hash`; preparar transición explícita si aparecen. No reconstruir asociaciones por inferencia ni asumir ausencia por las pruebas sintéticas.
3. Revisar privadamente configuración Google/OIDC existente, URI exacta de callback y origen permitido. `BINDING_DB_NAME` debe corresponder al destino y estar listo el esquema; verificar claves OIDC y `BINDING_CSRF_KEY` sin imprimir valores. Activar `GOOGLE_LOGIN_ENABLED=true` en el entorno elegido; es independiente de `BINDING_ENABLED`. No se configuraron credenciales en esta sesión.
4. Seguir WORKFLOW §7: comprobar procesos/puertos, iniciar solo servicios necesarios con el launcher local autorizado y verificar HTTP antes de abrir `http://localhost:5173/login`. No cambiar puertos/origen silenciosamente. No arrancar el launcher habitual antes de autorizar la DB que utiliza.
5. Con navegador sin sesión administrativa previa, ingresar mediante el botón Google con Hernán y después con Jesica. Comprobar POST con CSRF y 303, nombre correcto, rutas administrativas y logout; confirmar que una ruta protegida ya no autoriza tras salir. Si aparece conflicto, usar logout antes de seleccionar método; si falla, reintentar sin asumir éxito. Verificar convivencia legacy mediante acción explícita, sin fallback.
6. Revisar el diff y autorizar commit/integración posteriores; retirar después el acceso compartido por decisión expresa y coordinar despliegue. Esta entrega no autoriza producción ni pruebas reales en bases conservadas. Facilitadores fuera de alcance, sin descartar una ampliación posterior con permisos propios.

## Antecedente — corrección definitiva de logout — 10/11/2026

Autorización de continuidad del trabajo `PRISMA_2026-11-10_0142_ITER-12.2.B3_Login-Google`: implementar exclusivamente la relación persistente aprobada y cerrar la aceptación local. Se preservaron los cambios previos, rama y HEAD `cdacb5235c4bac321b099a63be61aee7395e10e5`. Los diagnósticos NO APTO inferiores son antecedentes superados para las sesiones emitidas con la nueva asociación.

### Implementación e integridad

`020.sql`, primera numeración libre comprobada, agrega `issued_session_hash CHAR(64) ascii_bin NULL`, UNIQUE, FK a `identity_sessions.token_hash` con ON DELETE RESTRICT y CHECK que permite asociación solo para login consumido. No agrega tablas ni secretos ni modifica 017–019. El migrador exige 019 y rechaza columna existente sin registro antes de DDL; replay registrado se omite. Probados unicidad, FK, bloqueo de borrado de sesión referenciada, replay, rechazo de parcial y conservación de un intento sintético anterior a 020 sin inferir asociación. MySQL DDL no se presenta como rollback transaccional.

`completeGoogleLogin()` mantiene las validaciones aprobadas y agrega la escritura del hash de sesión al intento consumido dentro de su misma transacción. La sesión sigue siendo aleatoria, con ocho horas absolutas y hash persistido. Fallar la escritura o afectar cero filas revierte evidencia, sesión y auditoría. Google se consulta fuera de esos bloqueos.

`cancelPresentedGoogleLogin()` valida ID, hash del secreto de navegador y propósito/aplicación/proveedor persistidos. La revocación no depende del clientId/redirectUri actual; las verificaciones de configuración del callback y autenticación no se relajan. Bajo institución → intento, invalida evidencia pendiente/claimed/verified o recupera la asociación consumida. Libera esos locks antes de resolver propietario y revocar con usuario → sesión y auditoría. La asociación es terminal/inmutable para el servicio, por lo que la separación de transacciones no permite una segunda emisión. El helper solo termina después del commit de revocación; el endpoint existente espera además todas las revocaciones administrativas presentadas.

Logout procesa todas las correlaciones temporales presentadas, incluidas cookies duplicadas; no selecciona un valor arbitrario ni omite cancelación por ambigüedad. Intenta todas y devuelve fallo cerrado si alguna operación requerida falla. Los parsers de inicio/callback/binding siguen rechazando la ambigüedad como antes. Tras éxito se borran cookies administrativas y temporales con sus atributos originales. Un callback tardío puede entregar una cookie, pero su token ya está revocado y el guard lo rechaza antes de cualquier nuevo logout.

### Retención y registros anteriores

Con 020, cleanup toma el bloqueo institucional y lee sesiones CRM vivas mediante lectura actual FOR UPDATE, ordenada por hash, antes de escribir intentos. Conserva asociaciones hacia sesiones no revocadas ni vencidas aunque el intento haya superado las 24 horas de retención. Mantiene el intervalo original para intentos elegibles y permite borrar la asociación cuando su sesión ya es inutilizable; no borra sesiones, usuarios ni auditoría. Las instalaciones 019 conservan el comportamiento B1/B2 anterior. No se altera la política de otras funcionalidades.

Un login consumido anterior con hash NULL continúa fallando cerrado, incluso si se revoca también una identidad presentada: no puede afirmarse que sea la misma sesión. Cleanup conserva esos intentos antiguos mientras exista cualquier sesión CRM viva; el bloqueo institucional serializa esta decisión con emisión, y solo los purga por la retención habitual cuando ya no queda sesión CRM viva. No se atribuye un propietario ni se revocan sesiones ajenas por inferencia.

La evidencia disponible confirma vinculaciones reales B2 y pruebas sintéticas descartables, pero no prueba ausencia de intentos login consumidos en bases conservadas. No se consultaron esas bases. **Antes de habilitación operativa:** comprobar el estado real y preparar una transición explícita si existen registros sin asociación; no interpretar esta aceptación como migración aplicada ni compatibilidad histórica automática. No hay backfill, migración ni modificación de datos reales en esta intervención.

Google OAuth sigue restringido exclusivamente a los UUID de administradores institucionales autorizados, Hernán y Jesica. No se implementa OAuth de facilitadores ni se decide su mecanismo de acceso futuro.

### Pruebas y evidencia

RED previo a implementación: 54 aprobadas y **3 fallidas esperadas**, que exigían logout exitoso con cookie consumida y revocación antes de entregar la respuesta de callback. La primera corrección pasó 63/63 B2/B3 y 13/13 OIDC. Revisión focalizada de la corrección detectó dos bordes del mismo flujo: configuración OAuth rotada y cookies temporales duplicadas. Se reprodujeron ambos con dos pruebas fallidas y se corrigieron sin nueva arquitectura. Resultados finales por suite, sin sumar corridas repetidas:

| Suite                   | Aprobadas | Fallidas | Omitidas | Esquema                           | Puerto | UUID                                   |
| ----------------------- | --------: | -------: | -------: | --------------------------------- | -----: | -------------------------------------- |
| `binding-b2-db.test.ts` |        67 |        0 |        0 | `prisma_disposable_b3_df414dc6df` |  62829 | `e556a7b9-dce5-11f1-a911-ec4c8cf2114b` |
| `oidc-db.test.ts`       |        13 |        0 |        0 | `prisma_disposable_b3_c90974f9c6` |  51805 | `40cb67a0-dce5-11f1-8ab1-ec4c8cf2114b` |
| `identity-db.test.ts`   |         5 |        0 |        0 | `prisma_disposable_b3_4ff4c3c334` |  64846 | `effa183d-dce5-11f1-81b2-ec4c8cf2114b` |
| **Total**               |    **85** |    **0** |    **0** |                                   |        |                                        |

Los 67 incluyen las regresiones directamente afectadas B1/B2/B3 y diez casos nuevos de asociación/rollback/integridad/retención/históricos/fallo de revocación/configuración rotada/duplicación. Las tres reproducciones anteriores se reutilizaron con el resultado corregido, no se duplicaron. La carrera posterior al commit comprueba token revocado y guard 401 inmediatamente después del callback tardío, antes de reintentar logout. Se conservan los casos de ambas autoridades, MySQL indisponible, fallo parcial y ausencia de fallback; no se repitieron suites ajenas al cambio.

MySQL 8.4.11 instalado, instancias vacías nuevas con `--no-defaults`, bind127.0.0.1, puertos distintos de 3306 y datadir propio por corrida. UUID obtenido del auto.cnf conocido y cotejado con servidor/datadir/puerto/PID antes de aprovisionar. Usuario b3_qa limitado al esquema, SHOW GRANTS verificado (USAGE global y ALL únicamente en su esquema), marcador de una fila y token aleatorio nuevo por instancia. Autorización Paso 3C y flags solo en procesos hijos, con guardas activas en la configuración estándar Vitest. Migraciones/baselines únicamente en destinos acreditados; OIDC comprobó además compatibilidad 019 y fundamentos 017. Ningún acceso a producción ni a las cuatro bases conservadas. Cada instancia se detuvo y eliminó en finally junto con credenciales y marcador; evidencia sin secretos queda fuera del repositorio.

Controles finales tras formato aprobados: typecheck, lint, build y diff-check; suite sin MySQL **700 aprobadas, cero fallidas y 305 omitidas** (incluye 67 B2/B3 omitidas solo en esa modalidad, ejecutadas realmente por separado). Avisos conocidos de Rollup/Zod y finales de línea. Inspección final: cero procesos MySQL propios y cero datadirs temporales remanentes; script efímero eliminado, credenciales/variables de procesos terminados, sin autorización persistida. Nueve archivos modificados y dos nuevos en el conjunto local B3, sin staging y con HEAD inicial intacto.

**Dictamen APTO para revisión final y eventual commit posterior**, con migración operativa, verificación de registros antiguos y navegador/Google reales pendientes antes de habilitación. No hay staging, commits, pushes, PR, merges, workflows ni despliegues; no se avanza a Bloques 4/5.

## Antecedente — Bloque 3: guard, sesiones y logout local

Trabajo `PRISMA_2026-11-10_0142_ITER-12.2.B3_Login-Google`. Base comprobada: `codex/iteration-12-identity-foundations`, `cdacb5235c4bac321b099a63be61aee7395e10e5`, sin cambios iniciales. El propietario confirma publicación de Bloques 1/2 y Actions #70/#71 aprobados; las referencias inferiores a publicación pendiente son antecedentes. No se repitieron auditorías, respaldos ni comprobaciones remotas cerradas.

Plan acotado ejecutado: (1) pruebas HTTP de autoridad/precedencia/logout; (2) integración del guard con la validación institucional existente; (3) revocación por credencial y coordinación del intento Google presentado; (4) pruebas DB preparadas para la entrada B2 de CI, documentación y controles locales. No se agregan migraciones, dependencias, CLI, frontend ni workflows. No hay staging, commits, pushes, PR, merges ni despliegues autorizados.

### Principal y validación

`res.locals.principal` se construye únicamente tras autenticar: `{ kind: 'identity', userId, displayName, roles }` o `{ kind: 'legacy' }`. El guard recibe la activación explícita de Google Login de la misma configuración que el transporte; no depende de que preflight haya logrado contactar MySQL. La cookie individual usa el nombre local `prisma_identity` o productivo `__Host-prisma_identity`.

`authenticateIdentitySession(token, 'crm', { requireInstitution: true })` comprueba hash SHA-256, aplicación, vigencia por reloj MySQL, revocación, usuario habilitado, rol admin, bootstrap cerrado, pertenencia a los dos UUID institucionales y vínculo Google vigente. Orden: institución → usuario/roles → vínculo → sesión, con lecturas actuales bajo bloqueo y sin caché. El contrato interno de fundamentos sin la opción conserva compatibilidad con 017; ningún acceso HTTP usa ese modo. Reemplazar o retirar el vínculo mediante los servicios institucionales revoca las sesiones anteriores en la misma transacción. No se autoriza por email ni datos aportados por el cliente.

Solo identidad: autoriza sin configuración legacy. Identidad inválida: 401, sin fallback. Ambas cookies administrativas: 409, independientemente de su validez, sin seleccionar autoridad. Sin identidad: legacy temporal. Fallo DB: 503 cerrado, sin sustitución de autoridad. Google deshabilitado: contrato de sesión legacy anterior conservado y el guard ignora la cookie individual; logout sigue revocando una credencial individual presentada, incluso con login deshabilitado.

### Estado de sesión compatible

`GET /api/auth/session`, siempre `Cache-Control: no-store`:

| Campo              | Semántica                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authenticated`    | Booleano de acceso vigente por la autoridad resuelta; falso también ante conflicto o indisponibilidad. Antes solo podía ser legacy.                |
| `configured`       | Mantiene el significado anterior: hash y secreto legacy configurados. Puede ser falso con identidad autenticada.                                   |
| `googleLogin`      | Extensión de Bloque 2 sin cambios: disponibilidad independiente del transporte y CSRF cuando corresponde. Solo se agrega con activación explícita. |
| `method`           | Solo con login individual habilitado: `identity`, `legacy` o `null`.                                                                               |
| `identity`         | Solo con login individual habilitado: `{ userId, displayName, roles }` o `null`; nunca token/hash/subject/email.                                   |
| `expiresAt`        | Solo con login individual habilitado: vencimiento absoluto individual en milisegundos Unix o `null`; no renueva la sesión.                         |
| `legacy.available` | Solo con login individual habilitado: configuración legacy válida; no certifica disponibilidad de MySQL.                                           |
| `status`           | Solo con login individual habilitado: `authenticated`, `anonymous`, `invalid`, `conflict` o `unavailable`.                                         |

La consulta de sesión devuelve 200 para anónimo o credencial inválida, 409 para conflicto y 503 para indisponibilidad al verificar credenciales/configuración requerida. Una instalación sin configuración legacy y sin credencial individual permanece anónima con `configured=false`. Errores no exponen detalles internos. El guard administrativo devuelve 401/409/503 según corresponda.

### Logout y concurrencia

`POST /api/auth/logout` pasa por las restricciones Origin/Fetch Metadata existentes antes de revocar. Resuelve el propietario de la sesión individual mediante su hash en el servidor y reutiliza `revokeIdentitySession`, incluyendo credenciales vencidas/revocadas. No recibe userId del cliente. Intenta todas las revocaciones presentadas, incluso cuando falla otra. Credencial malformada/inexistente no crea sesión ni requiere inventar un propietario. Repetir la revocación de una sesión ya revocada no la resucita.

Tras éxito de todas las operaciones, elimina cookies administrativas con Path=/, HttpOnly y SameSite=Strict, Secure y __Host- en producción; también temporales de login con SameSite=Lax. Un fallo produce 503 sin éxito ni borrado de cookies, para permitir reintentar. Las revocaciones exitosas previas permanecen efectivas: no hay transacción distribuida entre autoridades y no se promete rollback conjunto.

Legacy rechaza 409 si la petición presenta cookie individual o intento Google en curso. El inicio/callback Google conservan el rechazo de cualquier cookie administrativa. Si dos inicios ya salieron sin observar la cookie del otro, las cookies resultantes entran en conflicto y el guard deniega hasta logout; no se elige una autoridad por orden de llegada.

Logout invalida el intento Google presentado con bloqueo institución → intento. El callback hace la consulta a Google fuera de locks y luego consume bajo bloqueo institucional: si gana logout, la evidencia no puede emitir sesión. Si gana el consumo, logout falla cerrado para que se reintente después de recibir las cookies del callback. **Este mecanismo tiene un bloqueo reproducido que impide el cierre técnico:** una cookie temporal consumida retenida hace fallar repetidamente logout aunque se presente y revoque una identidad válida. No se acepta esperar su vencimiento como solución; diagnóstico y alternativa estructural en el apartado de aceptación siguiente. No se afirma cancelación de respuestas HTTP ya en vuelo.

Una petición autorizada antes de logout/revocación puede terminar; las posteriores vuelven a validar. Se conserva el límite transaccional documentado en Etapa 1, sin mantener bloqueos durante la ejecución completa de rutas operativas. La contraseña compartida permite nuevas sesiones legacy: **la convivencia temporal no proporciona revocación individual completa**. Retirada/operación administrativa pertenecen a B4; frontend y aceptación real de navegador a Bloque 5. No se avanza automáticamente.

### Antecedente — validación inicial del Bloque 3

Pruebas HTTP nuevas: 15 aprobadas, cero fallidas/omitidas en la suite completa. Cubren identidad sin legacy, conflictos, no fallback, indisponibilidad, logout/repetición/fallo parcial, Origin, cookies productivas, credenciales legacy duplicadas y revocación residual con login deshabilitado. Se observaron fallos antes de implementar guard/logout y el caso de duplicación; corregido el paso accidental de índice/array desde `map` al revocador. Typecheck detectó el tipo incorrecto de cabecera Set-Cookie en tests; corregido usando conversión explícita.

Se agregan 17 casos MySQL a `binding-b2-db.test.ts`, sin nueva entrada CI: vínculo/estado/rol/bootstrap/UUID institucional/aplicación/expiración/revocación/token, logout verificable y replay, reemplazo y acceso concurrentes, cancelación de evidencia y carreras HTTP callback/logout controladas por barreras. **No ejecutados** por ausencia de destino descartable acreditado. No se creó infraestructura, no se ejecutaron migraciones ni se accedió a las cuatro bases conservadas. Ninguna evidencia anterior de MySQL se presenta como aceptación de estos cambios.

Revisión focalizada del diff mediante `requesting-code-review`: sin defectos críticos/importantes confirmados en autorización o serialización. Se atendió el hueco de cobertura agregando carreras HTTP callback/logout deterministas (aún pendientes de MySQL). La observación de cookie temporal consumida retenida queda documentada arriba. Decisión explícita: logout intenta revocar la identidad residual incluso con login deshabilitado; si falla esa autoridad devuelve 503, porque declarar éxito dejaría una credencial reutilizable al reactivar Google. La compatibilidad de guard/session legacy sin credencial individual se conserva. Pendientes menores de cobertura: múltiples cookies individuales y fallo legacy con revocación individual exitosa.

Typecheck, lint y build aprobados; suite completa sin MySQL: **699 aprobadas, cero fallidas, 292 omitidas** (17 nuevas MySQL incluidas entre las omitidas). Avisos conocidos de Rollup/Zod y finales de línea; sin dependencias nuevas. La primera ejecución de Vitest no pudo iniciar por EPERM en caché temporal del sandbox; se repitió fuera del sandbox con autorización, siempre mediante `test:unit` que deshabilita acceso MySQL.

Dictamen **PENDIENTE** para aceptación del bloque, commit y CI remoto por integración MySQL no ejecutada. El código queda disponible para revisión local, sin staging ni commits, sobre el mismo HEAD inicial. Navegador real, Google real y frontend de Bloque 5 permanecen pendientes; no se declara login B3 íntegramente aceptado.

### Aceptación MySQL y cierre de cobertura — 10/11/2026

Continuación autorizada sobre el mismo HEAD y los ocho archivos de Bloque 3 ya existentes, sin staging. Se conservaron todos los cambios previos. En esta aceptación solo se modificaron los dos archivos de pruebas y estos dos documentos; no se rehízo implementación ni se modificaron políticas, servicios, esquemas, migraciones o workflows.

Se utilizó el binario MySQL **8.4.11** instalado, `--no-defaults`, bind local y puerto distinto de 3306, datadir nuevo por suite y sin registros conservados. El aprovisionamiento comprobó datadir efectivo, puerto, UUID leído del `auto.cnf` de la instancia conocida y propiedad del proceso Windows antes de crear esquema/usuario/marcador. Cuenta de pruebas `b3_qa@127.0.0.1`: solo USAGE global y ALL en su esquema temporal; SHOW GRANTS verificado. Token aleatorio nuevo de 32 bytes, marcador de una fila y `ALLOW_DESTRUCTIVE_DB_TESTS=destroy-disposable-only` entregados exclusivamente al proceso hijo. Las guardas existentes acreditaron cada conexión; no se deshabilitaron ni se usó configuración alternativa de Vitest. No se escribieron secretos ni autorización en `.env`.

Cada suite se ejecutó sola con `--no-file-parallelism --hookTimeout=30000`, baseline propio y una instancia nueva. Resultados finales:

| Suite                          | Aprobadas | Fallidas | Omitidas | Esquema                           | Puerto | UUID                                   |
| ------------------------------ | --------: | -------: | -------: | --------------------------------- | -----: | -------------------------------------- |
| `binding-b2-db.test.ts`        |        57 |        0 |        0 | `prisma_disposable_b3_88c3b69572` |  55922 | `b9ccf0fa-dce0-11f1-aa99-ec4c8cf2114b` |
| `identity-db.test.ts`          |         5 |        0 |        0 | `prisma_disposable_b3_5f32c73c3c` |  64893 | `795aab34-dce0-11f1-893a-ec4c8cf2114b` |
| `identity-bindings-db.test.ts` |         7 |        0 |        0 | `prisma_disposable_b3_ea5f00850d` |  64908 | `7e8b9b95-dce0-11f1-a649-ec4c8cf2114b` |
| `oidc-db.test.ts`              |        13 |        0 |        0 | `prisma_disposable_b3_bdabc21d67` |  64918 | `84583de0-dce0-11f1-a19f-ec4c8cf2114b` |
| **Total final**                |    **82** |    **0** |    **0** |                                   |        |                                        |

B2/B3 incluye los **17 pendientes aprobados**, 37 regresiones existentes y tres casos nuevos: duplicación individual, fallo parcial legacy y reproducción diagnóstica de correlación consumida. Las carreras HTTP callback/logout incluidas entre los 17 pasaron en ambos órdenes controlados. Una corrida previa B2/B3 de 56/56 fue seguida por otra instancia nueva para incorporar la reproducción final (no se suma dos veces al total final). Las demás suites no se repitieron después de su aprobación. El primer intento de infraestructura no abrió conexiones de pruebas ni ejecutó casos: root local rechazaba TCP bajo skip-name-resolve; se corrigió el aprovisionamiento de acceso local únicamente en la siguiente instancia nueva. La instancia fallida y las exitosas se detuvieron y sus directorios se eliminaron, incluidas credenciales/marcadores/certificados temporales. Variables solo de procesos hijos ya terminados. No hubo conexión al servicio en 3306 ni a producción ni modificación de las cuatro bases conservadas.

**Caso A:** dos cookies individuales válidas de usuarios distintos producen 401, sin elegir un valor ni llamar al autenticador en la prueba HTTP aislada. Con cookie legacy adicional, 409. Logout revoca ambas sesiones individuales; su reutilización falla. Prueba HTTP aislada y prueba MySQL aprobadas.

**Caso B:** barrera de prueba espera la revocación individual MySQL real antes de fallar el borrado legacy. Se observa 503 sin Set-Cookie, identidad ya inutilizable, ambas autoridades todavía en conflicto (sin fallback), legacy aún vigente por separado y reintento que revoca legacy, borra cookies y deja ambas credenciales inutilizables. No se simula una transacción distribuida ni se revierte la revocación individual exitosa. Prueba MySQL aprobada.

**Cookie OAuth consumida — bloqueo confirmado:** se conserva la correlación emitida al iniciar Google, se completa callback real del transporte sintético y se verifica acceso con la identidad emitida. Logout con identidad más correlación retenida devuelve 503; el token individual queda revocado. El segundo logout con las mismas cookies vuelve a devolver 503. Al retirar la correlación temporal del encabezado, el cierre devuelve 200. Esta última acción es diagnóstico del bloqueo, no una solución recomendada ni aceptación funcional. La prueba declara expresamente que reproduce un defecto de disponibilidad; no exige 200 al código actual ni convierte el bloqueo en criterio aprobado. En navegación normal el callback borra la correlación, y las carreras con eliminación normal pasaron, pero eso no elimina el caso retenido.

La causa es la falta de vínculo persistido intento→sesión: `consumeEvidence` borra subject/prueba, los intentos login deben conservar `user_id` e `initiator_session_hash` nulos por CHECK, y `identity_sessions` no guarda el intento de origen. No es seguro deducir propiedad por reloj/email/orden de llegada ni asumir que otra sesión presentada pertenece a ese intento. Ignorar la correlación consumida podría responder éxito dejando utilizable la sesión emitida por un callback todavía en vuelo. No se introducen cachés en memoria ni se reutilizan campos OIDC/auditoría con otra semántica.

Alternativa para autorización posterior: diseñar una relación persistente única entre intento de login y hash de sesión emitida, registrada en la misma transacción de consumo/emisión. Logout podría así revocar la sesión exacta incluso antes de que llegue su Set-Cookie; un callback tardío solo podría entregar una credencial ya revocada. Requiere diseño de esquema/migración aditiva y revisar el orden de bloqueos; **no se implementó ni se numeró migración**. La limitación no se acepta por su plazo corto.

Suite completa sin MySQL: **700 aprobadas, cero fallidas, 295 omitidas**. Incluye 16 HTTP de identidad; las 57 B2/B3 MySQL omitidas en esa modalidad sí se ejecutaron por separado, como indica la tabla. Las demás omisiones no se presentan como aprobadas. Controles finales tras formato: typecheck, lint, build y diff-check aprobados; avisos conocidos de Rollup/Zod y finales de línea. Inspección final de infraestructura: cero procesos MySQL propios y cero directorios `prisma-b3-accept-*` remanentes. El script efímero de aprovisionamiento también se eliminó; se conservaron solamente logs y evidencia sin credenciales fuera del repositorio.

Dictamen **NO APTO para cierre técnico del Bloque 3, commit y publicación controlada**, pese a las suites verdes: el bloqueo funcional está demostrado y su alternativa requiere ampliación estructural no autorizada. El diff queda disponible para revisión. Google/navegador reales y frontend de Bloque 5 pendientes; convivencia con contraseña compartida y revocación no retroactiva de peticiones ya autorizadas mantienen los límites documentados. No se avanza a Bloques 4/5 ni se hacen operaciones Git de escritura.

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
