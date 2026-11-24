# PWA-3 / Etapa 3A — preparación de integración y migración 023

24/11/2026. Preparación documental autorizada; ninguna consulta a producción,
escritura administrativa, migración, instancia MySQL nueva, integración o despliegue.
Fuente operativa para ejecutar una migración: [PRODUCTION_MIGRATIONS](../PRODUCTION_MIGRATIONS.md).
Este informe fija condiciones específicas de 023, sin sustituir ese procedimiento.

## PWA-3A.3 — cierre productivo informado de 023 (24/11/2026)

**023.sql APLICADA, VERIFICADA Y REGISTRADA EN PRODUCCIÓN**, según ejecución
manual y postflight reportados por el operador mediante phpMyAdmin de SiteGround.
Fuente: sesión supervisada y capturas aportadas por el operador. Codex documenta
esa evidencia; no se conectó a producción, ejecutó SQL ni realizó una verificación
productiva independiente para este cierre.

| Control              | Resultado informado por el operador                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Destino e identidad  | Base y servidor productivos identificados privadamente; MySQL 8.4, identidad corroborada previamente mediante `server_uuid`. Identificadores internos conservados fuera del repositorio conforme al manual operativo.                                                    |
| Respaldo previo      | Manual `PRISMA_PRE_PWA_023_2026-11-24`, creado a las 12:57 según panel. Restauración no ensayada; riesgo residual aceptado expresamente por el responsable. No equivale a prueba de recuperabilidad ni cubre operaciones posteriores.                                    |
| Artefacto            | Seis sentencias originales de `server/migrations/023.sql`, ejecutadas individualmente y sin errores. SHA-256 local verificado: `be94c2ddfec2991b9a52698ecf9a0674b9ebaecc6ee7819f9404ec9e1502c502`. No se infiere un cotejo independiente de Codex de la copia ejecutada. |
| Estructura           | Cinco tablas nuevas verificadas mediante SHOW CREATE TABLE; 5 PRIMARY KEY, 2 UNIQUE, 7 FOREIGN KEY y 7 CHECK, todos los CHECK ENFORCED.                                                                                                                                  |
| Datos iniciales      | `education_state` contiene únicamente `(id=1, revision=0)`; `education_person_links`, `education_presential`, `education_digital_rights` y `education_operations` contienen cero filas.                                                                                  |
| Política portal      | `portal_access_state`: `id=1`, `enabled=0`, `pilot_sealed=1`, `admissions_open=0`, `revision=1`, `security_seq=1`, `emergency_epoch=0`. Portal cerrado y sin admisiones nuevas.                                                                                          |
| Registro e historial | Registro manual de `023.sql` exitoso; historial final verificado de 23 registros, 001.sql–023.sql. `applied_at` de 023: `2026-11-24 20:31:32`, timestamp presentado por MySQL/phpMyAdmin, sin asumir zona horaria ni convertirlo a hora local.                           |

### Alcance del cierre y pendientes conservados

La migración queda cerrada documentalmente; no repetir DDL ni registro. Las
secciones inferiores, incluido el checklist, sus autorizaciones y el estado final
de 3A.2, conservan el corte anterior a esta ejecución como **antecedente histórico**,
no como operaciones pendientes de 023. La introducción describe la preparación
original; este apartado actualiza exclusivamente el cierre productivo informado.
No se deduce de él el estado de 023 en ninguna base local conservada.

Se preservan la aceptación sintética con observaciones, la mejora de reintento
pendiente de evaluación UX, la accesibilidad integral y la aceptación autenticada
real pendientes de 3A.2. La evidencia de migración no resuelve esos límites.
El riesgo de restauración no ensayada permanece explícito aun después de su
aceptación; cualquier restauración requiere plan y autorización propios.

Esta operación no integra ni despliega el código PWA. Siguen pendientes la revisión
del SHA exacto y su validación pertinente, autorización de integración y push manual
del propietario, despliegue y smoke posterior. La CI #102 conserva su alcance
histórico y no acredita los cambios documentales sin commit. Activación de la PWA,
apertura de admisiones y mutaciones reales requieren decisiones independientes;
no quedan autorizadas por la aplicación de 023.

Baseline local de este cierre: `codex/pwa-2b3-participant-binding`, HEAD
`fad690dfeecc42e5dd80d76aa38d0077de959ff4`, con modificaciones previas sin commit
en PROJECT_STATE, WORKFLOW y este informe. Se preservan; 3A.3 añade únicamente
documentación a PROJECT_STATE y este informe. Sin cambios de código, SQL,
infraestructura, ramas, commits, integración o despliegue realizados por Codex.

## PWA-3A.2 — inspección local y cierre PWA-3A.1 (24/11/2026)

Trabajo exclusivamente documental: no se repiten pruebas ni auditorías cerradas.
Rama local `codex/pwa-2b3-participant-binding`, HEAD inicial
`fad690dfeecc42e5dd80d76aa38d0077de959ff4`, árbol e índice limpios.
Main local `20777b258b2305d26f4a14807bf91911897fc66c`: candidata diez commits
por delante y cero por detrás. El único commit posterior a `5a47432` modifica
documentación (incluido README), sin código funcional ni SQL.
Las referencias locales de seguimiento apuntan a main `20777b2` y candidata
`5a47432`; no se hizo fetch ni consulta nueva a GitHub. No acreditan el estado
remoto actual ni el SHA desplegado. El baseline inferior conserva su fecha original.

### Aceptación visual sintética y procedencia

Fixture `tests/browser/education-access.html`, datos en memoria, sin Express ni
MySQL. Procedimiento de navegador: [WORKFLOW §7, protocolo C](../WORKFLOW.md#c-iniciar-y-verificar-el-servidor).

| Comprobación                                                  | Resultado y fuente                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Navegador integrado de Codex                                  | Operativo: Codex seleccionó escenarios, escribió consultas y pulsó botones reales en `http://127.0.0.1:5173/tests/browser/education-access.html`.                                                                                                                                                                                                               |
| 403                                                           | Aprobado en revisión visual manual, informado por el propietario para este cierre; no repetido por Codex.                                                                                                                                                                                                                                                       |
| Vinculación, renovación, revocación y habilitación presencial | Aceptación visual sintética favorable informada por el propietario; no repetida en 3A.2.                                                                                                                                                                                                                                                                        |
| Zoom 200 %                                                    | Inspección visual manual favorable informada por el propietario, limitada al área observada; no acredita toda la interfaz.                                                                                                                                                                                                                                      |
| 409 educativo                                                 | Aprobado según QA interactiva de Codex en 3A.1: retiro presencial de Yoga rechazado con «Revisión educativa obsoleta» e instrucción de cerrar, actualizar y revisar. Confirmación bloqueada, revisión 1, fuente habilitada e historial vacío; sin mutación indebida ni éxito falso.                                                                             |
| Recuperación del 409                                          | Aprobada por Codex: cerrar, volver a Normal, actualizar y revisar una nueva operación tras el rechazo definitivo. Revisión 2, fuente deshabilitada y único recibo `ce97215d-9289-424f-87dc-8072208da490`, resultado `presential`, `enabled:false`. No es reemisión de una operación incierta.                                                                   |
| 503                                                           | Aprobado con observación por Codex: consulta `PA`, mensaje «Servicio temporalmente no disponible», interfaz estable. Nueva consulta bajo escenario disponible recuperó resultados; también se comprobó borrar y reescribir `PA2`.                                                                                                                               |
| Cambio de escenario                                           | Observación reproducible del fixture: el mensaje 503 persiste al seleccionar Normal/409 hasta una nueva consulta; el selector solo cambia respuestas futuras, no limpia consultas. El error desaparece después de la consulta exitosa. Datos/persona seleccionada conservados intencionalmente en memoria. El error 409 no reapareció en la nueva confirmación. |
| Reintento explícito en búsqueda                               | No existe botón específico en lo observado; mejora UX pendiente de evaluación, sin corrección autorizada.                                                                                                                                                                                                                                                       |
| Evidencias de Codex                                           | Capturas de 503, rechazo 409, recibo y búsqueda recuperada incluidas en la conversación 3A.1, sin copia añadida al repositorio. Consola capturada sin errores ni advertencias.                                                                                                                                                                                  |
| Límites                                                       | Accesibilidad integral y autenticación real no verificadas. No acredita Google, MySQL, administración real, eliminación de actividad referenciada ni validación productiva.                                                                                                                                                                                     |

**Cierre PWA-3A.1:** aceptación sintética favorable con las observaciones del
fixture y de UX anteriores. La evidencia manual informada y la interacción de
Codex son distintas de los resultados automatizados históricos de #102 descritos
abajo; no se ejecutaron tests nuevos ni se atribuye esa CI a `fad690d`.

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

**Sintético sin DB:** los recorridos y errores cerrados en 3A.1 están registrados
arriba y no deben repetirse por rutina. Quedan sin acreditar accesibilidad
integral (teclado completo, foco/modal, lector de pantalla, contraste, mensajes
accesibles y movimiento reducido) y cobertura completa de zoom/responsive.
La inspección favorable a 200 % no resuelve esos pendientes. El fixture no prueba
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

### Checklist preparado en 3A.2 — NO EJECUTADO

No se abrió ninguna conexión a bases reales, ni siquiera para SELECT. Todas las
lecturas siguientes requieren autorización posterior específica de preflight,
destino y operador. Aplicar [PRODUCTION_MIGRATIONS §E](../PRODUCTION_MIGRATIONS.md#e-seguridad-fallos-y-recuperación)
para reemplazar el marcador en la copia privada y comprobar el contexto; conservar
allí resultados, fecha y responsable, sin publicar UUID, grants ni datos sensibles.

| Verificar / motivo                                                    | Evidencia esperada                                                                                                                                                                                                                                                                         | Detenerse si                                                                                                                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archivo/alcance: evitar SQL de otra revisión                          | SHA-256 local de 023 recalculado en 3A.2: `be94c2ddfec2991b9a52698ecf9a0674b9ebaecc6ee7819f9404ec9e1502c502`, coincide con el valor anterior. Último archivo local: 023. Cotejar también la copia exacta del operador.                                                                     | Huella distinta, otra migración pendiente o alcance diferente.                                                                                                                  |
| Identidad y contexto: evitar otra instancia/base                      | Lectura A coincidente con destino autorizado y UUID acreditado por canal independiente. `DATABASE()` debe coincidir; repetir tras reconexión/cambio y antes de cada escritura futura.                                                                                                      | NULL, marcador, host/puerto/UUID/esquema distinto o referencia independiente ausente.                                                                                           |
| Historial y parciales: impedir replay o aplicación incompleta         | B: secuencia exacta 001.sql–022.sql, 22 filas sin duplicidades lógicas ni posteriores; tabla de historial y padres visibles; cero tablas educativas.                                                                                                                                       | Historial faltante/incoherente, 023 ya registrada, cualquier tabla educativa presente o vacío inexplicable. Si ya está aplicada, conciliar sin reaplicarla.                     |
| Dependencias e integridad: siete FK viables                           | C: padres InnoDB, PK `people.id`/`activities.id` INT UNSIGNED e `identity_users.id` CHAR(36) ASCII/ascii_bin; DDL real compatible. Auditoría con CHECK UUID estándar de 022 ENFORCED.                                                                                                      | Tipo, signo, colación, motor, clave o CHECK incompatible; no inferir DDL desde el registro.                                                                                     |
| Estado del piloto: conservar política existente                       | D: una fila id=1, enabled=0, admissions_open=0, pilot_sealed=1; referencia informada revision=1/security_seq=1/emergency_epoch=0 y dos vínculos. Cotejar privadamente los pares institucionales ya acreditados, sin exportarlos.                                                           | Diferencia no explicada/autorizada frente al cierre; detener y conciliar, sin repetir sellado.                                                                                  |
| Capacidad, permisos y concurrencia: evitar fallo parcial/bloqueo      | A/C y revisión privada de permisos efectivos: versión compatible, CREATE/REFERENCES/INSERT y lecturas necesarias disponibles; capacidad de almacenamiento confirmada por hosting, ventana, operador único, ausencia de otro migrador y esperas de metadatos relevantes.                    | Permisos/capacidad desconocidos, espera o concurrencia sin control. No probar permisos mediante escrituras ni cancelar sesiones ajenas.                                         |
| Respaldo y recuperación: conservar servicio y operaciones posteriores | Nuevo pre-023 completo, DB incluida, fecha, integridad, retención, acceso, responsable y tiempos. Evidencia de restauración en destino aislado autorizado o límite explícito con decisión del propietario sobre riesgo residual.                                                           | Sin evidencia de recuperación ni decisión explícita del límite. El checksum, un selector de restauración o el respaldo pre-022 no bastan; no declarar recuperabilidad ensayada. |
| Orden de publicación: evitar rutas nuevas sin esquema                 | Confirmar SHA/configuración activa mediante revisión posterior autorizada; 023 aceptada antes del push candidato a main. Recuperación de código por revert y nuevo despliegue según cierre 022, previa autorización y compatibilidad; no presumir reactivación directa de builds antiguos. | SHA/configuración inciertos, migración automática externa no prevista, candidato desplegado antes de 023 o recuperación indefinida.                                             |

Las verificaciones de capacidad, backup, permisos y concurrencia necesitan
evidencia operativa adicional: las consultas de abajo por sí solas no las acreditan.
No crear un respaldo ni ensayar restauración dentro de este preflight de lectura.

**A. Identidad y versión.** La lectura de identidad es la de §E; versión y defaults
complementan el cotejo del esquema real, sin cambiar ninguna configuración.

```sql
SELECT @@hostname AS server_host, @@port AS server_port,
       @@server_uuid AS server_uuid, DATABASE() AS active_schema,
       'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO' AS authorized_schema;
SELECT VERSION() AS server_version,
       @@default_storage_engine AS default_engine,
       @@character_set_database AS database_charset,
       @@collation_database AS database_collation;
```

**B. Inventario antes de consultar tablas.** Esperar siete tablas de control/padres
y ninguna de las cinco educativas. Si faltan tablas conocidas o visibilidad de
metadatos, detenerse; solo después consultar el historial cualificado.

```sql
SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_COLLATION
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO'
  AND TABLE_NAME IN ('schema_migrations', 'identity_users', 'people', 'activities',
    'identity_audit_events', 'portal_access_state', 'identity_instructor_links',
    'education_state', 'education_person_links', 'education_presential',
    'education_digital_rights', 'education_operations')
ORDER BY TABLE_NAME;

SELECT name, applied_at
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`schema_migrations`
ORDER BY name;
```

**C. Estructura efectiva.** Comparar con los originales locales 001, 017, 021 y
022 y sus modificaciones aplicadas, sin reejecutarlos. Los valores por defecto
del servidor no sustituyen los tipos/colaciones de las columnas referenciadas.

```sql
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_users`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`people`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`activities`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_audit_events`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`portal_access_state`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_instructor_links`;

SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE, ENFORCED
FROM information_schema.TABLE_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO'
  AND TABLE_NAME = 'identity_audit_events'
  AND CONSTRAINT_TYPE = 'CHECK'
ORDER BY CONSTRAINT_NAME;
```

023 incorpora PK/UNIQUE para vínculo 1:1, fuente por persona/actividad,
referencia manual única y UUID de operación; índice de derechos y CHECK de
booleanos, fechas y objetos JSON. Sus tablas nacen vacías salvo el singleton.
No modifica filas existentes ni crea períodos; no corresponde recorrer datos
personales para buscar huérfanos en tablas educativas todavía inexistentes.
La integridad de filas nuevas dependerá de las siete FK RESTRICT; no desactivarlas.

**D. Política e invariantes mínimas**, solo si B/C fueron aceptados. Los conteos
no prueban por sí solos que los dos vínculos sean los correctos: esa comprobación
privada debe referirse a los pares ya acreditados, sin reprovisionar identidades.

```sql
SELECT id, enabled, pilot_sealed, admissions_open,
       revision, security_seq, emergency_epoch
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`portal_access_state`;
SELECT COUNT(*) AS pilot_links
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_instructor_links`;
```

### Autorizaciones pendientes

1. Ejecutar únicamente el preflight de lectura: destino, operador, mecanismo,
   consultas y evidencia privada. Esta tarea solo los prepara.
2. Crear respaldo pre-023 y, si corresponde, ensayar restauración en infraestructura
   aislada autorizada; resolver explícitamente cualquier recuperación no ensayada.
3. Tras revisar los resultados, autorizar por separado 023: archivo/huella,
   destino, ventana, exclusividad, mecanismo manual, postflight y registro.
4. Integración/push manual del propietario y despliegue requieren autorización
   posterior. Activación PWA, admisiones y mutaciones reales quedan aparte.

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

1. Conservar el cierre sintético 3A.1; resolver la aceptación/accesibilidad pendiente y, si se aprueba infraestructura
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

**Estado 3A.2:** cierre documental 3A.1 favorable con observaciones; checklist de
preflight de lectura preparado, NO EJECUTADO. Accesibilidad integral y aceptación
autenticada real pendientes; inventario productivo actual, respaldo pre-023 y
recuperación sin acreditar. Faltan las autorizaciones independientes enumeradas
arriba. Dictamen limitado: **PROCEDIMIENTO PREPARADO PARA REVISIÓN**; sin
conexión DB, migración, CI nueva, commits, ramas, integración, despliegue o activación
en esta tarea. Detenerse aquí; este informe no autoriza operaciones productivas.
