# PRISMA CRM — Migraciones productivas

Fuente operativa única y obligatoria para preparar y ejecutar migraciones productivas de PRISMA CRM. Fecha de consolidación: 18/11/2026. Este manual no autoriza escrituras ni acredita una ejecución por el hecho de describirla. Las migraciones SQL aplicadas son inmutables.

## A. Alcance y responsabilidades

- **Desarrollo:** una migración controlada necesita destino y autorización explícitos. Las bases locales conservadas no son descartables.
- **Pruebas:** exclusivamente infraestructura nueva, aislada y acreditada según [WORKFLOW §6](WORKFLOW.md#6-tests-db). Ningún ensayo histórico autoriza reutilizar una base conservada ni producción para tests destructivos.
- **Producción:** el propietario ejecuta los cambios manualmente y con guía. Codex prepara y revisa procedimientos dentro del alcance autorizado; no modifica producción ni SiteGround.
- Autorizar expresamente destino, migración, mecanismo, ventana, operador, postflight y registro. Respaldo y restauración requieren su autorización correspondiente. La autorización documental no permite ninguna de esas operaciones.
- Integración y push a `main`, despliegue, cambios de configuración, roles o identidades requieren decisiones separadas. Un permiso de migración no los comprende.

**Detenerse** ante destino incierto, diferencia con el plan, esquema parcial, historial incoherente, incompatibilidad, respaldo insuficiente, recuperación no definida, ejecución concurrente, error, timeout o respuesta ambigua. Preservar evidencia privada; no continuar, reintentar ni reparar automáticamente.

## B. Infraestructura productiva y procedencia

| Elemento     | Estado y acceso                                                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting      | SiteGround GrowBig, informado por el propietario. Capacidades y permisos concretos se confirman para cada operación.                                                                                                                                       |
| MySQL        | Site Tools → Site/MySQL → phpMyAdmin, según los rótulos vigentes. Seleccionar expresamente la base productiva identificada. El nombre y las credenciales no se publican aquí.                                                                              |
| Aplicación   | Node.js con despliegue automático desde `main`, confirmado por el propietario. Node 24 y build `npm run build`; confirmar configuración efectiva antes de publicar. `npm start` ejecuta `node dist/server/index.js` según [package.json](../package.json). |
| Terminal     | PowerShell puede invocar scripts Node locales; eso no determina ni protege el destino MySQL. Acceso remoto, TLS y permisos no se presuponen.                                                                                                               |
| Servidor/SSH | Alternativa solo si su disponibilidad, permisos, artefacto y directorio de trabajo se acreditan. No hay aquí un acceso SSH operativo verificado.                                                                                                           |
| Historial    | `schema_migrations(name, applied_at)`. Un registro no certifica por sí solo la estructura efectiva.                                                                                                                                                        |

Las configuraciones pueden cambiar. Registrar qué se comprobó directamente, qué informó el propietario y qué permanece pendiente, con fecha y evidencia sin secretos. El estado fechado del anexo no es un inventario permanente del servidor.

## C. Procedimiento general obligatorio

| Paso               | Acción y evidencia para continuar                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Identificar     | Fijar archivo SQL inmutable, commit, huella, código compatible y alcance autorizado. No usar archivos de otra rama ni un artefacto no identificado.                                                                   |
| 2. Destino/esquema | Comprobar destino real y versión del servidor mediante un canal autorizado. Revisar metadatos y DDL efectivo sin extraer datos personales o comerciales.                                                              |
| 3. Historial       | Comparar `schema_migrations` con los archivos esperados: faltantes, duplicidades lógicas, nombres inesperados y migraciones posteriores.                                                                              |
| 4. Parciales       | Buscar tablas, columnas, índices, restricciones y efectos de datos de la migración sin registro, o registro sin estructura completa. Ante discrepancia, detener el procedimiento normal.                              |
| 5. Compatibilidad  | Evaluar versión, InnoDB, tipos, colaciones, claves, CHECK, espacio, bloqueos y compatibilidad con código actual y anterior. Definir el orden esquema/código antes de operar.                                          |
| 6. Respaldo        | Confirmar copia previa completa, base incluida, fecha, integridad y vía de recuperación. Registrar si la restauración fue ensayada; no confundir checksum o selector de restauración con prueba de recuperabilidad.   |
| 7. Ventana         | Acordar duración, responsable único y mecanismo de control de escrituras/tareas de fondo. Considerar autenticación, integraciones y actividad posterior al respaldo.                                                  |
| 8. Mecanismo       | Elegir una herramienta de ejecución, sus permisos y límites. Preparar comandos o sentencias exactos para revisión, sin ejecutarlos por mera presencia en el manual.                                                   |
| 9. Ejecución       | El propietario ejecuta solo lo aprobado, supervisa cada resultado y conserva evidencia. Ante error o resultado ambiguo, detener; no reenviar solicitudes.                                                             |
| 10. Postflight     | Comparar estructura efectiva y efectos de datos autorizados con el SQL original. Revisar advertencias y continuidad administrativa; evitar escrituras comerciales de prueba.                                          |
| 11. Registro       | Manual: insertar el nombre exacto solo tras aceptar el postflight. Runner: registra automáticamente tras completar las sentencias; no insertar un segundo registro.                                                   |
| 12. Estado final   | Verificar registro único, fecha, estructura, invariantes y ausencia de efectos imprevistos. El éxito del cliente o el registro aislado no bastan.                                                                     |
| 13. Publicación    | Solicitar autorización separada de integración/despliegue. `main` dispara SiteGround; si el esquema es compatible, prepararlo antes de publicar según [WORKFLOW §8–10](WORKFLOW.md#8-cambios-de-db).                  |
| 14. Cierre         | Registrar fecha, operador, destino referenciado privadamente, archivo/commit/huella, resultados, incidencias, recuperación y pendientes. Distinguir migración, código publicado, build activo y aceptación funcional. |

El inventario inicial puede realizarse antes del respaldo; inmediatamente antes de escribir debe seguir siendo válido. Si la ventana, el destino o el contexto cambian, detenerse y actualizar la evidencia necesaria. No repetir pruebas cerradas sin una razón técnica nueva.

## D. Herramientas admitidas

| Herramienta             | Controles y límites                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| phpMyAdmin / SQL manual | Permite elegir la base y ejecutar solo las sentencias aprobadas. El operador controla preflight, exclusividad, orden, postflight y registro. No reproduce automáticamente las barreras del runner.                    |
| PowerShell / Node.js    | La terminal no aísla la DB. Revisar proceso, directorio, `.env` y entorno efectivo sin mostrar secretos. No cambiar credenciales o habilitar acceso remoto por conveniencia.                                          |
| `server/migrate.ts`     | `npm run db:migrate` invoca `tsx server/migrate.ts`; la alternativa compilada es `node dist/server/migrate.js`, con artefacto y SQL originales disponibles. Ambas requieren revisión específica de destino y alcance. |
| Servidor / SSH          | Reduce la necesidad de conexión MySQL desde Windows, pero no acredita por sí mismo seguridad. Requiere acceso autorizado, herramientas, configuración y recuperación disponibles.                                     |

### Comportamiento real del runner

[server/db.ts](../server/db.ts) carga `dotenv/config` y usa las variables efectivas `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `DB_SSL`. Existen defaults locales; TLS con verificación se configura solo cuando `DB_SSL` vale `true`. No leer ni copiar secretos a informes.

[server/migrate.ts](../server/migrate.ts) toma SQL de `server/migrations` relativo al directorio de trabajo, obtiene `GET_LOCK('prisma_migrate',30)`, crea el registro si falta y recorre en orden **todas las migraciones pendientes**. La CLI no ofrece un filtro `--through`: el parámetro interno `through` no es un argumento implementado de terminal.

El runner no pide confirmación de base ni contrasta el destino con un nombre esperado antes de escribir. Fuera de Vitest, las guardas de tests no lo protegen. No ejecutar desde el repositorio local sin acreditar el destino real; podría alcanzar una base conservada o productiva según el entorno.

Registra cada archivo tras terminar sus sentencias y libera el bloqueo al finalizar. El bloqueo solo coordina participantes que usan el mismo mecanismo, no detiene escrituras normales. Los preflights específicos detectan ciertos parciales; una migración ya registrada se omite sin certificar su DDL. En modo manual no hay bloqueo ni registro automáticos: asegurar exclusividad operativa y registrar después del postflight. No confiar en mantener un `GET_LOCK` entre solicitudes phpMyAdmin sin continuidad de sesión acreditada.

## E. Seguridad, fallos y recuperación

### Destino y contexto

En los ejemplos, `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO` es un marcador, nunca el nombre real ni un valor listo para ejecutar. El operador debe reemplazar **todas** sus apariciones, en literales e identificadores, por el nombre previamente verificado y autorizado, únicamente en su copia privada. No publicar esa copia ni credenciales. Si queda un marcador sin reemplazar, detenerse.

Distinguir tres datos: la base mostrada como seleccionada en phpMyAdmin, el esquema activo que devuelve `DATABASE()` y el esquema realmente examinado por el filtro o nombre cualificado de cada consulta. No suponer que coinciden. Un resultado vacío bajo `information_schema` no demuestra ausencia de tablas en producción.

Antes de **cada ejecución con escritura**, ejecutar esta lectura de identidad en el contexto donde se escribirá y cotejar el resultado con el destino autorizado:

```sql
SELECT @@hostname AS server_host, @@port AS server_port,
       @@server_uuid AS server_uuid, DATABASE() AS active_schema,
       'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO' AS authorized_schema;
```

En MySQL 8.4, cotejar también `@@server_uuid` con la referencia de instancia acreditada por un canal confiable; host/puerto o nombre de base iguales no identifican por sí solos la misma instancia. Si aún no existe esa referencia, acreditarla antes de autorizar escrituras, sin inferirla del nombre de esquema. Para otro servidor donde esa variable no esté disponible, detenerse y definir una identificación equivalente revisada; no omitir el control silenciosamente.

Las consultas de metadatos deben usar `TABLE_SCHEMA = 'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO'`, no depender únicamente de `DATABASE()`. Cualificar también `SHOW CREATE TABLE`, lecturas y registro con ese esquema explícito. Esto fija qué base se examina, pero **no corrige** un contexto activo erróneo para las sentencias originales sin cualificar.

Si phpMyAdmin cambia el contexto a `information_schema`, `DATABASE()` es NULL o difiere del esquema autorizado, host/puerto/UUID no coinciden, o la respuesta es vacía/inexplicable, **detenerse sin escribir**. Volver a seleccionar explícitamente la base productiva y repetir la lectura de identidad; investigar cualquier discrepancia antes de continuar. Una comprobación en otro cliente, pestaña o sesión no basta. No cambiar el contexto entre esta comprobación y la sentencia autorizada; ante cambios o reconexión, comprobarlo nuevamente.

### Respaldo y ventana

Identificar qué incluye la copia: DB, archivos persistentes y configuración necesaria para recuperar el servicio. Registrar acceso, integridad, retención, responsable y tiempos de restauración. Una copia existente o visible en el selector no demuestra una restauración efectiva. Si no se ensayó, declarar el límite y resolver expresamente ese riesgo antes de operar.

Una copia previa no cubre operaciones posteriores. Ante recuperación completa, preservar el estado actual y definir conciliación/recuperación de esas operaciones antes de reemplazar la base; no restaurar indiscriminadamente. Los respaldos y evidencias sensibles permanecen fuera del repositorio público.

### DDL y errores

`ALTER TABLE` puede esperar bloqueos de metadatos y afectar auditoría, login u otras escrituras. No prometer operación instantánea ni cancelar sesiones ajenas para desbloquearla. Acordar ventana y escalamiento ante espera o timeout.

MySQL 8.4 ofrece atomicidad para determinadas sentencias DDL, no rollback transaccional de toda una secuencia. Las sentencias previas pueden quedar confirmadas; el `rollback()` del runner no las deshace. No envolver el archivo en una transacción como supuesta protección integral. [DDL atómico de MySQL](https://dev.mysql.com/doc/refman/8.4/en/atomic-ddl.html).

Ante fallo, timeout o desconexión:

1. Detenerse; conservar sentencia, error, hora y resultado conocido. No pulsar reenviar ni reintentar automáticamente.
2. Inventariar registro, estructura y efectos reales mediante lecturas autorizadas; una desconexión no demuestra que la sentencia no se ejecutó.
3. Preparar recuperación específica y obtener aprobación: completar solo lo faltante, registrar solo un esquema completo verificado o evaluar reversión selectiva conservando datos legítimos.
4. No borrar tablas/columnas ni insertar registros a ciegas; no usar `INSERT IGNORE`, `REPLACE` o `IF NOT EXISTS` para ocultar el incidente.
5. Reanudar únicamente con estado reconciliado, procedimiento revisado y autorización.

### Código y DB son recuperaciones distintas

Volver a un build anterior no revierte el esquema. Si la migración es aditiva y compatible, conservarla al recuperar código. Un fallo de build no justifica restaurar toda la DB. Verificar antes que el build anterior sea recuperable; conservar los dos builds más recientes conforme a WORKFLOW §11. Cambios de autenticación, secretos, bootstrap o roles no son reparaciones implícitas de una migración.

## F. Evidencia histórica y límites

La investigación documental del 18/11/2026 confirmó estas fuentes, sin repetir conexiones ni pruebas:

- [Google Login](iterations/2026-11-google-login.md#corrección-local-de-la-cabecera-de-login-11112026), anotación incorporada en `dbe4e97cb8932bf79a38a10291a14a5344864b60`: el propietario confirmó migraciones **017–020 en producción**. No indica herramienta, entorno, comandos ni método exacto de registro.
- [Fundamentos 017](iterations/2026-11-identity-foundations.md), [vinculaciones 018](iterations/2026-11-identity-binding-operations.md) y [OIDC 019](iterations/2026-11-google-oidc-core.md) describen aplicaciones locales y controles del runner. [Google Login](iterations/2026-11-google-login.md) documenta respaldo/aplicación local de 020. No acreditan ejecución productiva con ese mecanismo.
- [PROJECT_STATE](PROJECT_STATE.md), cierre 10.2 incorporado en `e2019b2bb0afe00c4c03e08f09308b44246150df`: 014–016 «importadas y verificadas» y 16 registros. La palabra «importadas» no demuestra phpMyAdmin.
- [V1](V1.md) presenta PowerShell y `npm run db:migrate` para operación local; no es evidencia de comandos productivos históricos.

**El mecanismo exacto productivo de 017–020 no pudo reconstruirse del repositorio.** No afirmar que se usó PowerShell, phpMyAdmin o el runner. El procedimiento permanente de este manual y la propuesta 021 siguiente se distinguen de ese historial. Los cortes históricos no sustituyen el inventario vigente.

## Anexo — 021 / PWA-1B.1

**021.sql APLICADA, REGISTRADA Y VERIFICADA EN PRODUCCIÓN — 18/11/2026**, según
ejecución manual y evidencia comunicadas por el propietario. Codex no se conectó
a producción ni ejecutó la migración. El procedimiento original se conserva como
referencia; no autoriza repetir el DDL ni el registro ya completados.

### Cierre productivo informado — 18/11/2026

El propietario ejecutó mediante phpMyAdmin las cinco sentencias originales de
`server/migrations/021.sql`, sin errores reportados. Confirmó tres tablas nuevas
InnoDB, las dos columnas de auditoría, estado inicial correcto y portal deshabilitado,
sin vinculaciones, intentos OIDC ni sesiones portal. La base y el servidor MySQL
8.4.11-11 fueron identificados previamente; sus identificadores internos y
credenciales permanecen fuera de esta documentación.

Postflight por metadatos comunicado por el propietario:

| Control                                             | Esperado | Obtenido |
| --------------------------------------------------- | -------: | -------: |
| CHECK de política portal                            |        5 |        5 |
| CHECK de vínculos de facilitadores                  |        4 |        4 |
| CHECK OIDC portal                                   |       10 |       10 |
| CHECK nuevos de auditoría                           |        2 |        2 |
| FK con RESTRICT                                     |        4 |        4 |
| Índices UNIQUE                                      |        6 |        6 |
| Entradas del índice de limpieza OIDC (dos columnas) |        2 |        2 |

Registro final confirmado: **21 migraciones en total, un único registro de
`021.sql`**. Portal inactivo confirmado; cero vínculos, intentos y sesiones portal.
Estos resultados acreditan el cierre informado; no son nuevas consultas de Codex.

Respaldo previo: `PRISMA_PRE_PWA_021_2026-11-18`, creado a las 00:06 (Argentina),
con creación e inclusión de la base confirmadas en SiteGround. El propietario
confirmó ausencia de operaciones de usuarios desde el respaldo hasta el inicio
de la intervención. **Restauración efectiva no ensayada**; no se ejecutó ninguna
restauración ni se reportó pérdida de datos. No existe rollback transaccional de
toda la secuencia DDL. No se informó aquí la hora exacta de ejecución ni una
prueba posterior específica de continuidad administrativa.

El esquema productivo está preparado para PWA-1B.1. El código continúa en la rama
de trabajo, sin integración a `main`, despliegue ni funcionalidad portal habilitada.
CI #80 corresponde a `3d740218e4ed99156daa06438547223062c09eba`, no a los cambios
documentales posteriores. Integración, publicación y activación requieren sus
decisiones separadas.

### Estado inicial informado al 18/11/2026 — anterior a la ejecución

Fuente: comprobación manual comunicada por el propietario, no una nueva consulta productiva de Codex.

- 001–020 registradas consecutivamente; 021 no registrada.
- Sin las tres tablas portal ni `identity_audit_events.details_json` / `operation_id`; sin parcial de 021.
- Cuatro tablas existentes necesarias InnoDB, claves referenciadas con tipos, colaciones e índices compatibles.
- MySQL productivo reportado: **8.4.11-11**.
- Respaldo SiteGround **PRISMA_PRE_PWA_021_2026-11-18**, creado el **18/11/2026 a las 00:06**, hora Argentina. Inclusión de la base confirmada en el selector de restauración; **restauración efectiva no ensayada**.
- [GitHub Actions #80](https://github.com/hernan-go/prisma-crm/actions/runs/44222619190) aprobado sobre `3d740218e4ed99156daa06438547223062c09eba`: 8/8 jobs, 774 pruebas unitarias y 268 integraciones, incluidas 17 portal. Verificación remota anterior; no se repite aquí.
- PWA-1B.1 publicada exclusivamente en la rama `codex/pwa-1b1-data-security`; `main` en `86e786e35445b0ae3f41d4552454d6a527698cd9`, todavía sin PWA-1B.1. Sin despliegue ni activación del portal.

Los documentos anteriores conservan cortes que dicen CI pendiente o producción solo hasta 016. Este inventario describe el preflight histórico; el cierre productivo superior actualiza el estado de 021 sin reescribir esos antecedentes.

### Fuente y condiciones de ejecución

Fuente única: [server/migrations/021.sql](../server/migrations/021.sql), 79 líneas en el commit indicado. SHA-256 del archivo revisado:

```text
44D097BF5AFF022CD7F3BF6447E05DC514ECCB86CDB3AED52FFD60448CE286EE
```

No duplicar ni modificar ese SQL. Identificar el archivo/commit antes de operar; si cambia su huella o contenido, detenerse. Revisar autorización, ventana, control de escrituras y recuperación del respaldo ya identificado, incluida la actividad posterior a las 00:06. No presentar su restauración como ensayada.

El propietario seleccionará la base productiva en phpMyAdmin, pestaña SQL, y reemplazará el marcador en su copia privada de las consultas siguientes. Antes de **cada una de las cinco escrituras**, ejecutará la lectura de identidad de E y cotejará host, puerto, UUID y esquema activo con el destino autorizado. Las sentencias originales de 021 no cualifican la base: `DATABASE()` debe coincidir exactamente con el esquema autorizado. Si no coincide, si cambia el contexto o existe cualquier duda, detenerse sin ejecutar la sentencia; no modificar 021 para resolverlo. Una vez iniciada la ventana, sin otro migrador concurrente, copiar **una sentencia completa por ejecución** del archivo original:

| Orden | Líneas del archivo original | Acción                                                 |
| ----- | --------------------------- | ------------------------------------------------------ |
| 1     | 1–11                        | Crear `portal_access_state`.                           |
| 2     | 12                          | Insertar únicamente la fila inicial `id=1`.            |
| 3     | 13–26                       | Crear `identity_instructor_links`.                     |
| 4     | 27–71                       | Crear `identity_portal_oidc_attempts`.                 |
| 5     | 72–79                       | Ejecutar completo el ALTER de `identity_audit_events`. |

Conservar el resultado de cada ejecución y continuar solo si fue satisfactoria. Ante error/timeout/ambigüedad aplicar E; no reenviar ni avanzar. No añadir transacciones, desactivar FK/CHECK ni incluir todavía el registro de 021. No conceder roles, sellar el piloto o habilitar accesos.

### Postflight de estructura y estado

Consultas preparadas para ejecución manual posterior, no ejecutadas al redactar. Tras sustituir el marcador, comprobar primero la identidad según E. Los nombres cualificados y filtros siguientes examinan explícitamente el esquema autorizado, con independencia de lo que muestre el selector. Ante diferencias de contexto o resultados vacíos inesperados, detenerse e investigar; no interpretarlos como postflight aprobado ni avanzar al registro.

```sql
SELECT @@hostname AS server_host, @@port AS server_port,
       @@server_uuid AS server_uuid, DATABASE() AS active_schema,
       'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO' AS authorized_schema;

SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`portal_access_state`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_instructor_links`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_portal_oidc_attempts`;
SHOW CREATE TABLE `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_audit_events`;

SELECT TABLE_NAME, ENGINE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO'
  AND TABLE_NAME IN ('portal_access_state', 'identity_instructor_links',
                     'identity_portal_oidc_attempts', 'identity_audit_events')
ORDER BY TABLE_NAME;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE,
       CHARACTER_SET_NAME, COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO'
  AND TABLE_NAME = 'identity_audit_events'
  AND COLUMN_NAME IN ('details_json', 'operation_id')
ORDER BY COLUMN_NAME;

SELECT id, enabled, pilot_sealed, admissions_open,
       revision, security_seq, emergency_epoch
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`portal_access_state`;

SELECT COUNT(*) AS links
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_instructor_links`;
SELECT COUNT(*) AS attempts
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_portal_oidc_attempts`;
SELECT COUNT(*) AS portal_sessions
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`identity_sessions`
WHERE application = 'portal';
```

Aceptar solo si se verifica:

- Las cuatro tablas InnoDB y el DDL completo coincidente con 021, conservando la estructura administrativa anterior. Comparar definiciones, no solo nombres de restricciones autogenerados.
- Todos los PK, índices únicos, FK restrictivos y CHECK del original. En auditoría: `details_json JSON NULL`, `operation_id CHAR(36) ASCII ascii_bin NULL`, `uq_identity_audit_operation`, `chk_identity_audit_operation` y `chk_identity_audit_details_size` activos; el último limita JSON a 16384 bytes de almacenamiento.
- FK de vínculos a identidad/instructor; FK de intentos a identidad/sesión; cupos y estados restringidos; coherencia de timestamps, material sensible y asociación de sesión según el archivo.
- Una sola fila de política: `id=1` y los otros seis campos en cero; cero vínculos, intentos y sesiones portal. Ninguna admisión, rol ni cuenta modificada.

No efectuar escrituras comerciales ni pruebas negativas de restricciones en producción. Las integraciones MySQL aprobadas son evidencia separada; el postflight acredita el esquema real, no repite esa suite.

### Registro separado, solo tras aceptar el postflight

Confirmar de nuevo host, puerto, UUID y esquema activo mediante la lectura de identidad de E antes de esta escritura, sin cambiar de contexto después. Sustituir el marcador también en el INSERT y las lecturas finales. Si apareció un registro o hay cualquier resultado inesperado, detenerse sin escribir; no ocultar discrepancias.

```sql
INSERT INTO `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`schema_migrations`(name)
VALUES ('021.sql');
```

Después:

```sql
SELECT name, applied_at
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`schema_migrations`
WHERE name = '021.sql';

SELECT COUNT(*) AS migration_count
FROM `REEMPLAZAR_POR_ESQUEMA_PRODUCTIVO_VERIFICADO`.`schema_migrations`;
```

Esperado: un registro de 021 y 21 registros totales, conservando los veinte anteriores. El registro separado es necesario porque phpMyAdmin no ejecuta la lógica del runner. Si falla solo el registro, no repetir el DDL: inspeccionar y autorizar la recuperación específica. Si se hubiera elegido el runner con aprobación separada, no ejecutar este INSERT adicional.

### Cierre y recuperación específica

Verificar continuidad administrativa y portal inactivo con el alcance autorizado. Conservar el esquema aditivo al recuperar código anterior compatible. Ante parcial aplicar E: inventario, revisión y autorización de acciones específicas; ninguna limpieza automática ni restauración completa indiscriminada. No publicar `main` hasta aceptar la migración y obtener autorización independiente de integración/despliegue.

Registro de cierre actualizado con la comunicación del propietario del 18/11/2026.
Los datos no aportados se distinguen del resultado confirmado; no se reconstruyen
autorizaciones ni evidencias privadas por inferencia:

| Campo                                           | Resultado de ejecución                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autorización y alcance                          | Propietario informa ejecución manual siguiendo el procedimiento aprobado; cierre documental autorizado                                                              |
| Fecha/hora y ventana                            | 18/11/2026; hora exacta y duración no informadas                                                                                                                    |
| Operador                                        | Propietario, mediante phpMyAdmin                                                                                                                                    |
| Referencia privada de destino y contexto        | Base y servidor previamente verificados según propietario; sin identificadores públicos                                                                             |
| Archivo, commit y huella cotejados              | Archivo original 021 según propietario; copia local en a161b85 con SHA-256 coincidente con el documentado; no equivale a cotejo independiente de la copia ejecutada |
| Respaldo y recuperación disponibles al ejecutar | Copia previa confirmada; sin operaciones de usuarios hasta la intervención; restauración no ensayada                                                                |
| Resultado de cada una de las cinco sentencias   | Cinco ejecuciones correctas, sin errores reportados                                                                                                                 |
| Advertencias, incidencias y recuperación        | Sin errores ni pérdida de datos reportados; ninguna restauración                                                                                                    |
| Evidencias de DDL/estado inactivo               | Metadatos y estado inicial confirmados por propietario; detalle en cierre superior                                                                                  |
| Registro 021 y verificación final               | Un registro 021; 21 registros totales                                                                                                                               |
| Continuidad administrativa y estado final       | Portal inactivo, cero vínculos/intentos/sesiones; smoke administrativo específico no informado                                                                      |
| Integración y despliegue                        | NO AUTORIZADOS POR ESTE PROCEDIMIENTO                                                                                                                               |

## Anexo — 022 / PWA-1DA

**Propuesta operativa; NO APLICADA en producción.** Implementación exclusivamente
local autorizada el 21/11/2026; commit/publicación de la rama autorizados después,
sin autorización de integración ni intervención productiva.
[Diagnóstico, evidencia y pruebas](iterations/2026-11-pwa-1da.md).
El archivo 021 y su registro permanecen inmutables. El inventario productivo
001–021 y la discrepancia del CHECK fueron informados por el propietario mediante
lecturas supervisadas; no se consideran una nueva ejecución de 021.

### Aplicación futura, sujeta a autorización separada

Aplicar primero las secciones C–E de este manual: artefacto revisado/huella,
destino acreditado en la conexión ejecutora, respaldo y recuperación aceptados,
ventana y responsable único. La auditoría administrativa puede escribir mientras
se opera: acordar la coordinación y los límites de espera del ALTER; no cancelar
sesiones ajenas ni desactivar restricciones para forzar el cambio.

1. Identificar el archivo 022 revisado, su huella y el mecanismo autorizado. Para
   una ejecución manual, usar exactamente el único ALTER de ese archivo, sin
   adaptar 021 ni copiar el runner viejo del hosting como supuesto preflight 022.
   No requiere desplegar código de negocio para ser compatible con el sellado actual.
2. Verificar destino/UUID y esquema explícito según E. Releer solo la evidencia
   que debe seguir vigente al escribir: 021 registrada, 022 ausente, inventario sin
   migraciones inesperadas y estructura compatible. Contrastar el CHECK completo
   con la variante correcta o defectuosa conocida, presente y ENFORCED, columnas
   operation_id CHAR(36) NULL/details_json JSON NULL y tabla InnoDB. Comprobar que
   todas las filas satisfacen el CHECK nuevo. El preflight del runner implementa
   esos controles; en ejecución manual deben realizarse por lecturas equivalentes
   sobre el esquema explícitamente autorizado. Cualquier otra variante detiene.
3. Guardar evidencia privada del DDL anterior y recuentos de auditorías para el
   postflight. Ejecutar una sola vez el ALTER original 022, con identidad de destino
   vigente en la misma conexión/contexto. No usar DROP y ADD en solicitudes separadas.
4. Comprobar definición final estándar y ENFORCED; mismo resto de columnas,
   restricciones e índices; conservación de filas. Verificar portal/piloto cerrados
   y estado anterior conservado. No insertar recibos sintéticos ni sellar como smoke.
5. En modo manual, registrar `022.sql` una única vez después del postflight aceptado,
   mediante INSERT ordinario, sin IGNORE ni REPLACE. El runner actualizado registra
   automáticamente: no añadir un segundo registro. Confirmar nombre único,
   fecha, inventario final 001–022 y continuidad administrativa proporcional.
6. Registrar resultado y límites. Migración aplicada no significa código publicado,
   piloto sellado ni portal habilitado. Futuras publicaciones y sellado requieren
   autorización independiente y un nuevo plan vigente; conservar el UUID histórico
   privado y no interpretar su ausencia de recibo como permiso de reintento.

### DDL completado con registro no confirmado

El ALTER puede quedar confirmado aunque falle después el INSERT de historial.
`rollback()` no revierte DDL. El runner 022 se detiene sin reintento y conserva un
diagnóstico específico incluso si falla la limpieza de la conexión.

Ante error, timeout o desconexión, **no volver a ejecutar el runner ni el ALTER**.
Identificar otra vez el destino y leer esquema e historial; no inferir persistencia
o ausencia del registro del mensaje recibido.

| Estado observado                                              | Acción propuesta, siempre con aprobación expresa                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| CHECK final correcto, 022 ausente, DDL/postflight acreditados | Reconciliar solamente el registro con INSERT ordinario; no repetir DDL.                   |
| CHECK final correcto, 022 registrada una vez                  | No escribir; verificar y documentar el resultado ya persistido.                           |
| CHECK defectuoso o inesperado, registro ausente               | Detenerse, preservar evidencia y revisar plan/recuperación; sin reintento automático.     |
| CHECK incorrecto con 022 registrada, o historial incoherente  | Detenerse; no borrar registros ni marcar como éxito. Preparar recuperación independiente. |

No restaurar el CHECK defectuoso como rollback rutinario: volvería a bloquear
operaciones legítimas. Cualquier reversión de esquema o restauración es una
operación separada que debe preservar datos posteriores y contar con aprobación.

### Intervención consolidada propuesta

Revisión del repositorio: build ejecuta typecheck/Vite/TypeScript; start ejecuta
dist/server/index.js. Ninguno invoca migrate; no hay hook npm de instalación que
aplique SQL. CI usa MySQL efímero, no producción. Con la configuración de hosting
previamente acreditada (main y npm run build), publicar 022 en main despliega su
archivo y el runner, pero NO aplica 022 automáticamente. Las opciones actuales del
panel no fueron reinspeccionadas: antes de intervenir confirmar en una sola revisión
de Deployment Options/log que no se agregó un comando externo de migración.
SiteGround permite configurar el build y ejecutar migraciones por SSH;
[referencia oficial](https://www.siteground.com/blog/hosting-node-js-projects-with-siteground).

Propuesta única para autorización: ventana con respaldo vigente y acceso SSH
privado; aplicar 022 desde el artefacto revisado antes del push a main, utilizando
el preflight nuevo y el único ALTER (sin desplegar aplicación para transportar SQL).
Consolidar destino, preflight, confirmación de migración, postflight y registro en
una ejecución supervisada del propietario. Ante error, detenerse según el cuadro
anterior. Una vez aceptada la migración, el propietario integra/publica main y
verifica SHA/build COMPLETADO/salida 0 y acceso administrativo. Luego, en una segunda
ejecución privada, usar sesión CRM vigente, pares institucionales ya acreditados y
UUID de operación conservado; consultar primero su recibo, generar plan nuevo y
exigir confirmación de sellado. Resultado: revisión 1, dos vínculos, una auditoría,
portal y admisiones cerrados. No ejecutar enable. No se requiere repetir consultas
históricas: solo los controles de destino, concurrencia y sesión vigentes al escribir.

Los bloques ejecutables definitivos se fijarán al SHA aprobado y al destino privado
en la intervención autorizada; este procedimiento no es un permiso para ejecutarlos.
