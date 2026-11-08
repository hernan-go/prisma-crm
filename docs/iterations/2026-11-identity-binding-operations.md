# Iteración 12.2.A — Vinculación y operaciones seguras

Implementada localmente sobre 6641189, rama codex/iteration-12-identity-foundations. Consolidada en `7dd8234`; sin publicación. El alcance siguiente corresponde al corte 12.2.A; el núcleo OIDC posterior se documenta en [12.2.B1](2026-11-google-oidc-core.md). Iteración 12 abierta. Login compartido, frontend, sesiones heredadas y MCP intactos. No OAuth, biblioteca OIDC, credenciales reales ni nuevas rutas. Ningún consumidor productivo importa el nuevo servicio.

## Persistencia

018 aditiva, posterior a 017 inmutable, aplicada exclusivamente en prisma_test. Dos tablas: identity_institution (singleton, dos UUID previstos, inicialización cerrada y bandera reservada legacy_retired) e identity_binding_operations (UUID objetivo, propósito, hash SHA-256 del código aleatorio de 256 bits, vigencia 15 minutos, candidatura, identidad previa esperada, consumo/revocación). Sin datos personales preconfigurados, cascadas ni cambios económicos. La bandera legacy_retired solo prepara persistencia: no existe operación de retirada y no afecta al login actual.

El runner exige 017 y rechaza cualquiera de las nuevas tablas sin registro de 018. Registra tras todas las sentencias. DDL no reversible transaccionalmente. Ante parcial, detener e inspeccionar/completar mediante procedimiento aprobado; no borrar ni registrar a ciegas. Replay registrado omite DDL, no verifica estructura efectiva.

## Fronteras de confianza

createBindingService exige dos adaptadores: authorize(context, action) y verifyCandidate(evidence, operationId/userId). No hay adaptadores por defecto ni configuración que convierta una declaración del cliente en autorización. En pruebas, contextos y pruebas son objetos reconocidos por mapas privados, no roles ni sub suministrados libremente. B deberá validar sesión Google reciente o canal privilegiado y evidencia criptográfica correlacionada con operación/UUID; devolver un objeto con sub sin verificar sería un uso inseguro del contrato. El factory es un punto de composición de servidor confiable, no una barrera frente a código malicioso ejecutándose en el mismo proceso.

Las primitivas de 12.1 siguen siendo internas y no deben exponerse como API. Para los dos UUID reservados, la vinculación directa está bloqueada; habilitar/conceder admin sin vínculo también está bloqueado. Su autorización HTTP real queda para B. No se trata actor_id=null como permiso implícito.

## Operaciones

- configure: solo adaptador operator, exactamente dos UUID distintos existentes, deshabilitados, sin roles ni Google; configuración única. No se crean personas reales.
- issue: inicial solo operator y UUID previsto durante bootstrap; reemplazo con institución inicializada y otro admin vigente o operator. Invalida autorizaciones previas del objetivo. El código se entrega una vez y solo persiste su hash.
- submitCandidate: requiere evidencia validada por adaptador y ligada al UUID/operación, código correcto y operación disponible. Guarda una sola candidatura; no asigna roles, vincula ni habilita.
- approve: autorización separada, verifica vigencia, unicidad y asociación previa sin cambios. Sustitución, revocación de sesiones, consumo y auditoría en una transacción. Inicial habilita/concede admin; reemplazo conserva estado y roles (una suspensión no se levanta silenciosamente).
- revoke: invalida autorización pendiente con auditoría.
- restrict: suspensión, retiro de rol o desvinculación, revocando sesiones y auditando. Último admin protegido.

Al aprobar ambos UUID se marca initialized y revocan autorizaciones iniciales pendientes. No existe reset del bootstrap, ni depende de reinicios/variables. Otra instancia del servicio conserva ese estado DB. La limpieza de tests es SQL privado limitado a fixtures propios, no una capacidad del servicio.

## Atomicidad y concurrencia

identityMutation toma primero el singleton FOR UPDATE, luego filas de identidades/operaciones. En estado initialized, antes de commit exige al menos un usuario enabled con rol admin y vínculo Google. Se aplica también a las mutaciones de estado/roles de 12.1. Las lecturas de administradores son actuales FOR UPDATE, evitando snapshots obsoletos tras esperar un bloqueo. Restricciones únicas arbitran sub duplicado.

Una candidatura revocada, vencida o consumida no se aprueba. La aprobación concurrente tiene un único ganador. expected_subject impide aprobar un reemplazo preparado sobre una asociación ya cambiada. Error de persistencia o auditoría revierte mutaciones, sesiones y consumo. No se registran códigos, tokens ni sub en eventos; la candidatura pendiente sí contiene sub como dato privado necesario. Limpieza/retención de esas filas deberá definirse antes de producción.

Las solicitudes previamente autorizadas no se cancelan retroactivamente. El adaptador futuro debe revalidar autorización dentro de la operación, y no llamar a estos servicios recursivamente desde authorize/verify. Deadlocks/errores DB provocan rollback; no hay reintento automático ni degradación de seguridad. La regla del último admin garantiza estructura, no disponibilidad de Google ni control efectivo de la cuenta externa.

## Pruebas y límites

### Correcciones de cierre: vencimiento y aislamiento CI

La revisión detectó que approve comprobaba expiración antes de esperar al adaptador de autorización. Corregido: después de autorizar y comprobar identidades, un UPDATE condicionado reclama la operación con expires_at mayor al reloj MySQL, consumed_at NULL y revoked_at NULL. Debe afectar exactamente una fila; si no, toda la transacción aborta. Ese consumo es el punto de aprobación, previo a vincular/revocar/auditar; un fallo posterior también revierte el consumo. La creación de autorizaciones usa ahora el mismo reloj MySQL para su vigencia. El check inicial de aplicación es preliminar, nunca la única decisión temporal.

Se agregaron regresiones permanentes: expiración durante authorize (espera controlada, rechazada sin vínculo/rol/habilitación ni consumo) y consumo informado con cero filas tras UPDATE real (rollback comprobado, sin vínculo/privilegios/evento de aprobación y con reintento válido). Los escenarios previos conservan aprobación válida, vencimiento inicial, revocación, consumo único y doble aprobación concurrente.

CI: el primer paso usa `npm test -- --exclude tests/identity-bindings-db.test.ts`; el siguiente ejecuta exclusivamente `npx vitest run tests/identity-bindings-db.test.ts`. RUN_DB_TESTS=true permanece en el job. Sin continue-on-error ni condiciones que omitan el segundo paso tras éxito del primero; cualquier fallo hace fallar el job. Son pasos secuenciales sobre el mismo servicio MySQL, sin vinculaciones concurrentes con identidad 12.1. Invocaciones manuales con RUN_DB_TESTS=true deben respetar esa misma separación; npm test sin exclusión no garantiza ese aislamiento.

Resultado final local: 16 pruebas de identidad/auth/aislamiento seguidas de siete integraciones de vinculaciones aprobadas en prisma_test, en procesos secuenciales. Suite general final sin opt-in DB: 593 aprobadas, cero fallidas y 225 omitidas (incluyen las siete integraciones ejecutadas aparte). Typecheck/lint/build y diff-check aprobados. YAML parseado con js-yaml disponible, exclusión/orden y ausencia de tolerancia al fallo comprobados mediante assertions. No se ejecutó el workflow nuevo en GitHub Actions ni toda su fase general con opt-in DB local; su aprobación remota sigue pendiente. No se modificaron migraciones 017/018 ni runner como parte de estas dos correcciones. El ensayo MySQL vacío permanece pendiente. Los resultados de cinco integraciones siguientes son el antecedente previo a las regresiones añadidas.

Cinco integraciones nuevas aprobadas exclusivamente en prisma_test: bootstrap y cierre, ausencia de privilegios pendientes y rechazo de bypass por primitivas; prueba arbitraria/UUID cruzado/código erróneo; caducidad y revocación; sub duplicado; aprobación concurrente; reemplazo con UUID conservado y sesiones revocadas; fallo inyectado de auditoría con rollback; suspensiones concurrentes y último admin protegido frente a estado/rol/desvinculación; replay/detección de esquema sin registro. 16 pruebas previas de identidad/auth/aislamiento aprobadas separadamente. Fixtures propios eliminados tras comprobar UUID reservados; no se reinicializa prisma_test. Estado institucional vuelve a no configurado solo mediante teardown SQL de esos fixtures; esquema 018 permanece.

Typecheck/lint/build aprobados, con avisos conocidos de Zod/Rollup. Suite general: 593 aprobadas, cero fallidas, 223 omitidas; las cinco nuevas integraciones están entre las omitidas normales y se aprobaron separadamente. No se repite QA visual: no hay cambios frontend. No pruebas reales Google ni productivas.

Pendiente ensayo de instalación en MySQL completamente vacío: no hay entorno limpio autorizado y no se modificaron guards de tests. No se ensayó caída física entre sentencias DDL ni recuperación integral del hosting.

## Dependencias para B y recuperación excepcional

Falta verificar y ensayar el canal privilegiado real de SiteGround. Se implementó el contrato operator, no una CLI, contraseña o endpoint de bootstrap/recuperación. Ese adaptador está deliberadamente ausente. Puede autorizar reemplazos cuando ambos admins no acceden, preservando UUID; no se declara recuperación operativa.

B deberá incorporar biblioteca OIDC, firma/emisor/audiencia/nonce/state/PKCE, correlación de evidencia/candidatura, autorización Google reciente, rate limits, CSRF/cookies, acceso operativo a bootstrap y recuperación ensayados. La protección de último admin no debe evitar una contingencia controlada del propietario, pero no hay mecanismo ordinario para dejar cero admins o reabrir bootstrap.

Dictamen local: APTO CON OBSERVACIONES para revisión del núcleo interno. No autoriza conectar rutas, desplegar ni continuar automáticamente a B.
