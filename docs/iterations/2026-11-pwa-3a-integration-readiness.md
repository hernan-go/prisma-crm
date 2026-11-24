# PWA-3 / Etapa 3A — preparación de integración y migración 023

24/11/2026. Preparación documental autorizada; ninguna consulta a producción,
escritura administrativa, migración, instancia MySQL nueva, integración o despliegue.
Fuente operativa para ejecutar una migración: [PRODUCTION_MIGRATIONS](../PRODUCTION_MIGRATIONS.md).
Este informe fija condiciones específicas de 023, sin sustituir ese procedimiento.

## Baseline y evidencia

- Rama local y GitHub: `codex/pwa-2b3-participant-binding`,
  `5a47432fe48ca19acf36acb54257b58005a8cf92` al iniciar; árbol e índice
  limpios, sin stash, nueve commits por delante de main y cero por detrás.
- Main local y GitHub: `20777b258b2305d26f4a14807bf91911897fc66c`.
- [Actions #102](https://github.com/hernan-go/prisma-crm/actions/runs/45332985401):
  `push` del SHA candidato, intento 1, completed/success, `verify` y ocho suites
  `integrations` aprobadas. El log de verify registra 1016 aprobadas y 391
  omitidas; las ocho suites aisladas aprobaron 337 casos, incluidos los 14 de
  `education-db.test.ts` y sus seis regresiones nuevas de eliminación. Quedan
  54 casos MySQL optativos fuera de esa matriz; no se atribuye aprobación a ellos.
- El propietario comprobó visualmente el 24/11 la aplicación SiteGround
  `prisma-crm` de `crm.prismacomunidad.com.ar`: GitHub, rama `main`, despliegue
  automático activo, Node 24 y build `npm run build`, sin guardar cambios.
  Capturas entregadas en la conversación; Codex no consultó el panel.
- 022 aplicada, registrada y verificada en producción; piloto sellado con dos
  vínculos, portal deshabilitado y admisiones cerradas **según el cierre informado
  por el propietario**. No se repitió una lectura productiva. 023 no está
  acreditada allí ni en las bases locales conservadas.

Si este informe se confirma mediante un commit documental posterior, #102 sigue
acreditando `5a47432` y no el SHA documental nuevo. Antes de publicar o integrar
un HEAD diferente, revisar su diff y decidir la validación del SHA exacto; no
atribuir #102 al commit posterior.

## Preparación funcional y aceptación pendiente

| Recorrido                                                     | Evidencia del candidato                                                                                                                              | Pendiente de aceptación                                                                                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Digital: concesión, renovación, revocación y OR por actividad | Servicios, HTTP y UI con tests sin DB; `education-db` 14/14 en MySQL aislado. Fechas trimestrales y fuentes independientes según informes 2B.1/2B.2. | Recorrido administrativo autenticado en destino autorizado: confirmar identidad, persona, disciplina, referencia manual, fechas, recibo e historial; ninguna compra o cobro contable se crea automáticamente. |
| Vínculo identidad/persona 1:1                                 | Tests de autorización, extremos permanentes, homónimos/UUID y rollback; QA visual sintética 2B.3.                                                    | Selección explícita y doble comprobación humana de UUID/persona. La asociación no acredita titularidad ni crea sesión participante. Provisión real de identidad exige autorización independiente.             |
| Fuente presencial                                             | Suite educativa y QA sintética de alta desde inscripción/slot reales, retiro y continuidad explícita.                                                | Confirmar que se entiende la continuidad tras cancelar/cambiar mes o tener deuda, y que el retiro afecta solo esa fuente; cualquier mutación con personas reales requiere permiso separado.                   |
| Idempotencia, concurrencia y auditoría                        | Revisión esperada, UUID de operación, recibo y rollback en tests de servicio/HTTP/MySQL; log de #102 aprobado.                                       | Ejercitar en entorno aislado autorizado respuesta perdida, recibo, reintento del mismo UUID, conflicto 409 y doble administrador; no recrear una operación incierta con otro UUID o referencia.               |
| Eliminación de actividad referenciada                         | Nueve tests sin DB en verify y seis casos MySQL nuevos en `education-db` aprobaron; FK RESTRICT y rollback conservan filas.                          | Confirmar en UI el 409 claro y la opción de archivar, además de eliminación legítima, sin usar datos reales para provocar el conflicto.                                                                       |
| CRM existente y piloto                                        | Siete suites MySQL históricas de la matriz aprobaron con el nuevo SHA; no hay cambio de política del piloto.                                         | Smoke posterior al despliegue de login Google administrativo, personas, actividades, inscripciones, pagos y portal cerrado; no inferirlo de CI.                                                               |

**Sintético sin DB ahora:** reutilizar el fixture versionado
`tests/browser/education-access.html` para búsqueda, homónimos, estados,
confirmaciones, errores 403/409/503, recibos y pantallas responsive. Revisar
teclado completo, orden y retorno de foco en modal, lector de pantalla, zoom
200 %, contraste, nombres y mensajes accesibles, y movimiento reducido.
Los informes 2B.2/2B.3 ya acreditan inspección visual básica; no repetirla por
rutina ni presentarla como accesibilidad completa. El fixture no prueba
autenticación Google, MySQL ni la pantalla integrada real de Inscriptos Período.

**Entorno aislado nuevo, solo con autorización propia:** recorrido HTTP/UI
autenticado con identidades, personas, matrículas y pagos _sintéticos_, con
usuario MySQL limitado y acreditación de WORKFLOW §6. No reutilizar `prisma_dev`,
`prisma_test`, `prisma_demo` ni QA conservada para suites destructivas. Aceptación
real +50, provisión de identidad y mutaciones administrativas reales permanecen
fuera de 3A. Tras un despliegue futuro, primero smoke productivo de solo lectura;
cualquier acción de negocio con datos reales necesita autorización explícita.
Portal `/app/` y admisiones siguen cerrados; 2B.4 no está implementada.

## Migración 023: artefacto, dependencias y compatibilidad

- Archivo inmutable: `server/migrations/023.sql`, introducido en `30440a2` y
  presente sin cambios en `5a47432`. SHA-256 de bytes locales:
  `be94c2ddfec2991b9a52698ecf9a0674b9ebaecc6ee7819f9404ec9e1502c502`.
  Cotejar de nuevo el artefacto exacto que el operador vaya a ejecutar; una
  huella local no certifica una copia privada futura.
- Requiere `001.sql`–`022.sql` aplicadas y registradas con estructura efectiva
  coherente; en particular, `identity_users` (017), `people`, `activities` y el
  registro 022. El cierre de 022 informado no sustituye el inventario previo.
- Cinco tablas InnoDB: `education_state` (fila `id=1`, `revision=0`),
  `education_person_links`, `education_presential`,
  `education_digital_rights` y `education_operations`. Son cinco CREATE TABLE
  más un INSERT del estado, en ese orden; siete FK RESTRICT hacia
  `identity_users`, `people` y `activities`, claves únicas y CHECK. Sin
  backfill, cambios de tablas existentes, períodos, pagos o piloto. Inicialmente
  no hay vínculos ni derechos educativos.
- MySQL productivo 8.4.11-11 fue informado para 021; confirmar versión, motor,
  tipos, colaciones, espacio, permisos y efectos de locks **en la ventana actual**.
  CI usó MySQL 8.4 aislado, no certifica el servidor productivo.
- Código actual de main no consulta estas tablas. Con 023 completa y vacía, el
  esquema es aditivo para ese código; antes de nuevas filas, las FK nuevas no
  bloquean borrados existentes. Con filas educativas futuras, los DELETE quedan
  restringidos; el candidato traduce el caso de actividad a 409. No se infiere
  compatibilidad con esquemas parciales. `npm run build` no aplica migraciones.

## Preflight productivo propuesto — solo lectura y autorización aparte

El propietario fija destino, ventana, operador único y mecanismo. Elegir
**phpMyAdmin / SQL manual** como propuesta a revisar: permite ejecutar solo las
seis sentencias originales 023 y registrar `023.sql` después del postflight.
No usar `npm run db:migrate` de forma automática: recorre _todas_ las migraciones
pendientes, no ofrece `--through` de CLI y no confirma el destino. Si el
inventario muestra otra migración pendiente, detener el plan de 023 aislada.

1. Acreditar privadamente la base y el servidor de producción. En la misma
   conexión/contexto que luego escribiría, cotejar `@@hostname`, `@@port`,
   `@@server_uuid`, `DATABASE()` y el esquema autorizado como exige
   PRODUCTION_MIGRATIONS §E. Confirmar UUID por canal confiable independiente;
   no publicar identificadores ni credenciales. Repetir antes de **cada**
   sentencia de escritura y después de toda reconexión o cambio de contexto.
2. Inventariar `schema_migrations` con nombre/fecha: exactamente una secuencia
   001–022 coherente y ninguna 023 ni posterior, duplicidad lógica o nombre
   extraño. Verificar DDL efectivo de padres `identity_users`, `people` y
   `activities` (`SHOW CREATE TABLE` cualificado), tipos y motor compatibles con
   las FK de 023; el registro 022 por sí solo no acredita DDL. Confirmar también
   continuidad de `portal_access_state` e `identity_instructor_links` por
   metadatos y comprobaciones mínimas privadas, sin exportar filas sensibles.
3. En `information_schema.TABLES`, filtrando `TABLE_SCHEMA` por el esquema
   **autorizado**, confirmar ausencia de las cinco tablas educativas. Si aparece
   alguna tabla con 023 sin registrar, 023 registrada sin cinco tablas íntegras,
   historial incoherente o resultado vacío inexplicable, detener. No ejecutar
   el runner ni usar `IF NOT EXISTS` para disimular un parcial.
4. Cotejar el SQL/huella y revisar en la copia exacta tipos, colaciones,
   CHECK, UNIQUE, FK y orden. Confirmar versión, permisos DDL/INSERT/registro,
   capacidad de phpMyAdmin para ejecutar cada sentencia y conservar resultado.
   No pegar un archivo entero a ciegas ni usar una copia de otro commit.
5. Preparar un respaldo **nuevo pre-023** de DB completa y componentes
   necesarios para recuperar el servicio; verificar inclusión, hora, integridad,
   retención, acceso y restauración viable. El respaldo pre-022 no representa el
   estado actual. Registrar si hubo ensayo de restauración: si no, declarar y
   aceptar expresamente el riesgo o detener antes de autorizar escritura.
   Acordar control de escrituras concurrentes y actividad posterior al respaldo,
   ventana, responsable, escalamiento y criterio de recuperación.

## Ejecución manual supervisada propuesta — no autorizada en 3A

1. Con nueva autorización específica para **023 en producción**, revalidar
   preflight, destino/UUID/contexto, respaldo y ausencia de otro ejecutor.
   El operador abre la base autorizada en phpMyAdmin. Antes de cada escritura,
   repetir la consulta de identidad de PRODUCTION_MIGRATIONS §E en esa sesión.
2. Ejecutar **una sola vez y por orden** las seis sentencias _originales_ del
   archivo cuya huella se cotejó: CREATE `education_state`, INSERT `(1)`, CREATE
   `education_person_links`, CREATE `education_presential`, CREATE
   `education_digital_rights`, CREATE `education_operations`. Registrar cada
   resultado. No modificar SQL histórico, agregar cascadas, datos de prueba ni
   `IF NOT EXISTS`. Ante error, timeout, desconexión o respuesta ambigua,
   detener inmediatamente; no reenviar ni probar la sentencia siguiente.
3. **Antes de registrar 023**, inspeccionar DDL efectivo de las cinco tablas
   (`SHOW CREATE TABLE` con esquema explícito), motor, columnas/tipos/colaciones,
   claves/índices, siete FK y CHECK respecto del archivo. Confirmar una fila
   `education_state` con `id=1, revision=0`; cero filas en las otras cuatro
   tablas. Confirmar que tablas anteriores, piloto, portal y admisiones no
   cambiaron frente al preflight, mediante lecturas mínimas sin exportar datos.
4. Solo tras aceptar ese postflight, insertar **una** fila de nombre exacto
   `023.sql` en `schema_migrations` del esquema autorizado, usando el procedimiento
   manual de PRODUCTION_MIGRATIONS §C/E. No hacer ese INSERT si se usó el runner.
   Verificar registro único, fecha, total esperado 23 y estructura otra vez.
   Un fallo del registro no autoriza repetir el DDL.
5. Registrar privadamente operador, hora, destino, versión, SHA/huella, respaldo,
   resultados y cualquier incidente; en el repositorio dejar solo estado
   sanitizado cuando exista autorización documental. Mantener portal y admisiones
   cerrados. El éxito de 023 no autoriza integrar ni desplegar.

## Detención y recuperación

DDL de MySQL puede confirmar cada sentencia y esperar metadata locks; un
`rollback()` del cliente/runner no deshace las seis como unidad. Si ocurre un
parcial o se pierde la respuesta, preservar el estado y leer de nuevo historial,
cinco tablas, estado e invariantes. No borrar tablas, filas o registro ni reintentar
automáticamente. Conciliar solo mediante un plan específico revisado y nueva
autorización: completar lo faltante si es seguro, registrar únicamente una
estructura completa acreditada, o evaluar reversión selectiva conservando datos
legítimos. Una restauración completa necesita reconciliar operaciones posteriores
al respaldo; no restaurar indiscriminadamente. Recuperar código con un build
anterior verificado no revierte DB: si 023 completa es compatible, conservarla.
Ante bloqueo de metadatos, no cancelar sesiones ajenas; escalar según ventana.

## Orden posterior, condicionado a nuevas autorizaciones

1. Completar aceptación sintética/accesibilidad y, si se aprueba infraestructura
   aislada, recorrido administrativo integrado con datos sintéticos. Resolver
   hallazgos antes de cambiar el SHA candidato; toda corrección exige nueva CI.
2. Propietario revisa y autoriza por separado preflight, respaldo y migración
   023 productiva. Aplicar y aceptar postflight **antes** de publicar nuevo código
   en main. Verificar que portal/admisiones sigan cerrados.
3. Revisar SHA exacto a integrar y su CI. Si se incluye un commit documental de
   3A, #102 no cubre ese HEAD; evaluar/publicar/validar el nuevo SHA bajo permiso
   separado. Obtener autorización de integración y push a main del propietario.
4. Solo tras 023 aceptada, integrar main por el flujo autorizado. Su push dispara
   SiteGround automáticamente; CI no es un freno preventivo. Consultar por
   separado Actions y build SiteGround por SHA, estado COMPLETADO y salida 0.
   El proceso de hosting puede instalar sin respetar el lockfile, según
   WORKFLOW §10; mantener recuperación de build previo evaluada.
5. Smoke proporcional: Google administrativo, CRM existente y lectura del módulo
   educativo; comprobar `/app/` indisponible y admisiones cerradas. Mutaciones
   con datos reales requieren permiso independiente. Documentar por separado
   esquema aplicado, código integrado, build activo, aceptación y activación.

Si SiteGround desplegara el candidato **antes** de completar 023, las rutas
administrativas educativas que consultan `education_state` y las demás tablas
fallarían; build exitoso no implica esquema listo ni smoke funcional. Evitar el
push a main hasta postflight de 023 aceptado. Si ya ocurrió, detener operaciones
educativas, identificar SHA/build/esquema y preparar recuperación del código
anterior verificado o completar 023 solo con nuevas autorizaciones; no activar
`/app/` ni usar producción para ensayos.

**Estado 3A:** plan preparado, no ejecutado. Bloqueos para la siguiente operación:
aceptación pendiente; inventario productivo actual, respaldo pre-023 y recuperación
sin acreditar; autorización específica de la migración y, después, de la
integración/despliegue. Dictamen limitado: **APTO PARA PREPARAR MIGRACIÓN**;
ninguna escritura productiva queda autorizada por este informe.
