# Iteración 8 — Implementación local de Gastos Recurrentes

> Actualización de cierre: la propuesta histórica de 011 contenida abajo fue superada por el contrato de dos tablas aprobado e implementado. Estado vigente, pruebas y activación pendiente: [independencia mensual 011](2026-10-recurring-period-independence.md). Los apartados que dicen «candidato/no autorizado» describen la etapa anterior.

Fecha: 2026-10-22. Rama `codex/iteration-8-statistics-design`, HEAD/main `dcee416`. Sin commits, push, merge ni deploy. Estadísticas e IPC pendientes anteriores preservados. Registro de la autorización inicial: implementación local y escrituras exclusivamente en prisma_test. **La autorización posterior permitió aplicar 010 en prisma_dev**, documentada al final; prisma_demo y producción permanecen sin cambios.

## Resultado funcional

`/publicidad` integra tarjetas reales de recurrentes y conserva debajo el CRUD de adicionales. Iconos Lucide, lápices visibles de 44×44 px con borde/icono #78CBB2, sin franja superior ni período repetido. Dos columnas en 390/700/701, cuatro en 1024/1440 y ocho en 1920; una por debajo de 300 px útiles. Importe exacto con centavos, sin convertir dinero a Number. Nombres mensuales persistidos se conservan al renombrar catálogo.

Configuración: **Configurar → confirmar los ocho de PRISMA → Configurar los ocho de PRISMA**. Acción única para catálogo vacío: Alquiler, Expensas, Luz, Gas, Internet, Agua, Impuestos, Cobertura médica. No se ejecuta por leer, migrar ni crear períodos. Si ya existen conceptos, rechaza el preset sin sobrescribir; permite revisar/editar por ID o crear conceptos propios. Otra instalación puede mantener catálogo vacío o configurarlo diferente. Desactivar conserva categorías históricas vinculadas; no hay borrado de conceptos.

Sin movimiento: `$ —`. El lápiz carga importe positivo y fecha explícita dentro del período, inicialmente vacía. La corrección actualiza el mismo ID y conserva concepto, fecha y notas; notas y conceptos históricos tampoco se recortan como efecto de corregir el importe. El backend compara ID y valores previos y responde 409 ante formulario desactualizado. Primer envío repetido idéntico devuelve el ID existente; distinto responde 409. `useSave` invalida Gastos y Estadísticas. Cerrado: ocho tarjetas consultables y lápices deshabilitados; requiere reapertura para cualquier escritura mensual.

Asociación histórica: botón del importe → **Vincular categoría existente por ID**, inventario de movimientos y confirmación explícita. No se buscan coincidencias por nombre. Una fila se marca sin tocar sus campos/timestamps; varias conservan sus IDs e importes y muestran subtotal en revisión, sin formulario de suma. Desvínculo explícito devuelve la categoría a adicionales y preserva movimientos/timestamps. La regularización económica exige revisar registros individualmente después de desvincular y reabrir, si corresponde; no hay fusión ni eliminación automática. Categorías vinculadas no se repiten debajo.

## Persistencia e integridad

`server/migrations/010.sql` oficial: catálogo vacío, referencia opcional de categorías con FK RESTRICT, UNIQUE de concepto/período; marcador booleano canónico, columna generada VIRTUAL e índice UNIQUE para un marcado por categoría, CHECK del booleano. No cambia 001–009 ni hace backfill económico. No crea períodos, categorías, importes ni vínculos históricos. Conserva la cascada existente de categoría a gastos.

`peopleTransaction`, bloqueo de período/concepto/categoría y lectura bloqueante de movimientos serializan las escrituras. Todas las rutas genéricas de escritura de Gastos rechazan categorías vinculadas o marcadores incoherentes. Eliminación de configuración existente bloquea períodos con cualquier gasto antes de borrar categorías vacías. Endpoints heredan autenticación y control de origen. Estadísticas sigue sumando las mismas filas de `period_expenses`; no se cambian motor, fórmulas, IPC ni Pago Facilitadores.

Límite: el UNIQUE protege el movimiento marcado; SQL administrativo sin marcador no tiene cardinalidad absoluta. Si introduce múltiples/no canónicos, la lectura muestra revisión y bloquea guardado, sin excluir esas filas de Estadísticas. Las instalaciones deben usar la API para operar. No se introducen triggers.

## Preflight y respaldo ejecutados

Destino comprobado antes de escribir: `DB_NAME=prisma_test`, host local `127.0.0.1`, `SELECT DATABASE() = 'prisma_test'`, MySQL **8.4.11**. Migraciones registradas exactamente 001–009, catálogo inexistente. No se mostraron contraseñas ni se cambiaron configuraciones de conexión permanentes.

Respaldo local completo de las 22 tablas con mysqldump 8.4, `--single-transaction --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF --column-statistics=0`. Archivo ignorado `tmp/recurring-implementation/pre-010-prisma_test.sql`, 67.473 bytes; fin del dump comprobado. SHA256: `e1df9570caa09896b92bd8d53df4d808ab213181c46c0072821ae8d061040086`. Manifiesto `preflight.json` incluye conteos y hashes de filas ordenadas por ID por tabla. Respaldo local, no subido al repositorio.

## Aplicación, postflight y recuperación comprobados

1. Se interrumpió deliberadamente la secuencia después de crear el catálogo vacío, antes de registrar 010. Confirma el efecto durable del DDL parcial; no se confía en ROLLBACK.
2. El runner existente completó 010 e insertó su registro después del último paso.
3. Reejecución directa de las 49 sentencias aprobada, validando estructura existente y omitiendo DDL compatible.
4. Comparación de las 21 tablas originales de negocio, excluida `schema_migrations` y retirando solo metadatos nuevos del cálculo: hashes originales idénticos. Catálogo vacío, sin backfill.
5. Prueba DB repetible: retirar deliberadamente el índice canónico final en prisma_test, repetir el SQL para recuperarlo y volver a repetirlo completo. Sin pérdida de filas.
6. Fixtures funcionales y visuales retirados por sus IDs; catálogo nuevamente vacío. Cambian contadores AUTO_INCREMENT como consecuencia esperada de pruebas; no se restablecen artificialmente.

**Recuperación preferida:** detener escrituras, comprobar DATABASE/host, conservar manifiesto y error, revisar information_schema. Si la estructura parcial es compatible, reejecutar 010: no registrar manualmente éxito anticipado. Una guarda fallida requiere diagnóstico, no saltarla ni modificar 001–009. DDL no revierte con rollback.

**Respaldo completo como alternativa:** verificación SHA256 con `Get-FileHash`, detener servidores y asegurar nuevamente destino `prisma_test`. Restauración mediante cliente MySQL con `--database=prisma_test` y `source` del dump; credenciales por mecanismo local privado. Inventariar objetos nuevos no presentes en el dump antes de una restauración total, preservar cualquier configuración posterior y revisar FK/registro de migraciones. No se ensayó restauración completa del dump: se verificó respaldo y se probó recuperación hacia adelante de DDL parcial. No copiar esta operación a dev/demo/producción.

## Validación

Pruebas nuevas opt-in con `DB_NAME=prisma_test`, `RUN_RECURRING_DB_TESTS=true`; verifican host y DATABASE antes de cualquier DDL/escritura y rechazan catálogo no vacío. Cubren preset/configuración, períodos históricos/abiertos/cerrados, ausencia, carga/corrección 505.000→525.000 mismo ID, aislamiento, fecha/notas, cero histórico, adicionales, vínculos/timestamps, múltiples, duplicación, concurrencia/reintentos, conflicto optimista, rutas HTTP/autenticación, FK, replay/recuperación de índice y total exacto de Estadísticas. Limpieza exclusivamente de IDs de fixtures, sin reset global.

Revisión **de la aplicación real**, autenticada con credenciales ficticias temporales y backend contra prisma_test: catálogo vacío → configuración explícita de ocho → primera fecha vacía → carga 505.000 → corrección 525.000, movimiento #22 con fecha 2092-02-10 y nota conservadas. Mayo 2020 previo a 010 muestra ocho ausencias; enero 2092 cerrado muestra ocho lápices deshabilitados; marzo 2092 no copia febrero. No se alteraron datos de esos períodos históricos originales.

Responsive real verificado en 390, 700, 701, 1024, 1440 y 1920 px: ocho tarjetas, importe sin desbordamiento, documento sin scroll horizontal, lápiz de 44 px. Evidencia local ignorada `tmp/recurring-implementation/expenses-1024.png`. El ajuste temporal de viewport se restauró y el servidor temporal de QA se detuvo.

Validación final aprobada: Prettier sobre archivos compatibles tocados; typecheck; lint; 193 tests normales aprobados y 159 casos DB omitidos; 7 casos focalizados aprobados (5 unitarios y 2 integraciones de recurrentes/Estadísticas en prisma_test); build y diff check. Vitest normal requirió repetición fuera del sandbox por EPERM sobre temporales; aprobado fuera del sandbox. Build emitió únicamente avisos conocidos de anotaciones Zod/Rollup. La suite legacy que resetea toda la base no forma parte de esta intervención. Auditoría final tras limpiar fixtures: hashes de las 21 tablas originales de negocio idénticos, 001–010 registradas, catálogo vacío.

## Archivos del alcance

Nuevos: `client/RecurringExpenses.tsx`, `client/recurring-expenses.css`, `shared/recurring-expenses.ts`, `server/recurring-expenses.ts`, `server/migrations/010.sql`, `tests/recurring-expenses.test.ts`, `tests/recurring-expenses-db.test.ts` y este cierre técnico.

Modificados: `client/Expenses.tsx`, `shared/expenses.ts`, `server/expenses.ts`, registro de router en `server/routes.ts`; documentos PROJECT_STATE, DECISIONS, ROADMAP, ARCHITECTURE, diseño de recurrentes y referencia coordinada en diseño de Estadísticas. Resto de archivos pendientes pertenecen al trabajo anterior de Estadísticas/IPC.

## Plan original de activación y pendientes (aplicación dev completada posteriormente)

Esperar revisión de Hernán. Para prisma_dev, con autorización independiente: detener backend/escrituras; confirmar host/DATABASE; respaldo verificado; revisar 001–009, categorías/movimientos e información de esquema; aplicar 010 mediante runner; postflight de FK/índices/CHECK, catálogo vacío y originales intactos; iniciar código compatible. Después, configurar expresamente los ocho de PRISMA en la UI, revisar históricos por ID y conciliar Gastos/Estadísticas. Ninguna consulta/asociación de cerrado escribe sin reapertura.

No iniciar este código contra esquema pre-010: endpoints de Gastos requieren columnas nuevas. Migrar antes de habilitar el código, con escrituras pausadas para evitar clientes anteriores que no conocen la guarda recurrente. Aplicación productiva y despliegue son posteriores, manuales y con autorización separada; producción permanece en 001–009.

Pendientes funcionales: decidir si admitir nuevos ceros (hoy se conserva importe positivo); revisión humana de históricos múltiples y asociaciones ambiguas; integración/revisión de todos los cambios pendientes de Iteración 8. El catálogo de pruebas no configura la instalación PRISMA real. No hay cálculo de ganancia neta ni segunda contabilidad.

## Aplicación controlada posterior en prisma_dev

Autorizada expresamente por Hernán y completada el 2026-10-22 a las 18:17 UTC. Esta sección supera únicamente el estado anterior de prisma_dev pendiente; conserva el registro de validación inicial en prisma_test. No se ejecutó SQL contra prisma_demo ni producción, ni se modificó prisma_test durante esta operación.

### Preflight y exclusión de escrituras

- Rama codex/iteration-8-statistics-design, HEAD dcee416; trabajo anterior preservado y nada staged.
- 010 idéntica al cuerpo de la propuesta validada y a la copia íntegra del diff de revisión anterior; 49 sentencias. SHA256 del archivo: d01ee5200d8531238c507d1c11163e628d8f5b2382af8a6afc18502ce6a6071b. Registro 010 de prisma_test comprobado en solo lectura.
- Host local, SELECT DATABASE() = prisma_dev, MySQL 8.4.11. Permisos SELECT, INSERT, CREATE, ALTER, INDEX, REFERENCES y CREATE TEMPORARY TABLES comprobados. Exactamente 001–009 registradas; tabla, columnas y restricciones 010 ausentes.
- Backend local y watcher identificados y pausados; puerto 3001 sin listener. Ninguna otra sesión visible en prisma_dev antes y después del respaldo. Bloqueo cooperativo DATABASE():people mantenido durante la migración, además del bloqueo de migración del runner.
- 22 tablas InnoDB, 108 filas totales, conteos/hashes por tabla y 25 FK sin huérfanos. Diciembre 2026 período #5 abierto: movimientos #3 y #4, fechas 2026-12-16/17 e importes 50000.00/40000.00.

### Respaldo externo y recuperación

Carpeta fuera del repositorio: C:/Users/Hernán/prisma-crm-backups/2026-10-22T18-17-34-322Z-pre-010-prisma_dev/.

Archivo prisma_dev.sql, 30.023 bytes. **SHA256: ba4144bb7a7e36b0d7086a38669b930b913830f9408ee89a75e541060fbad5f1**. mysqldump 8.4 terminó con exit code 0 y marca Dump completed; lectura completa posterior, DDL de las 22 tablas e INSERT de todas las tablas no vacías comprobados; importes históricos presentes. Opciones de snapshot transaccional, sin locks de tablas, sin tablespaces/GTID/column statistics e inclusión de routines, triggers y events. Huella revalidada con Get-FileHash. Contraseñas solo por entorno privado del proceso, no publicadas.

La carpeta contiene manifest-before.json (conteos/hashes/migraciones/FK), postflight.json y RECOVERY.md. No se agregó a Git. Recuperación únicamente con autorización expresa: detener escrituras, reconfirmar destino prisma_dev y hash, preservar estado fallido y evaluar reintento de 010 ante DDL parcial compatible. ROLLBACK no revierte DDL. Si se autoriza restaurar, cliente MySQL con --database=prisma_dev y source del dump absoluto, revisando primero objetos nuevos no presentes en el respaldo y sus FK. No eliminar esos objetos ni restaurar automáticamente. Comparar luego registro, conteos/hashes e históricos del manifiesto. No se ensayó restauración destructiva sobre prisma_dev.

### Aplicación y postflight

Se ejecutó migrate('010.sql') del runner existente, con DB_NAME fijado a prisma_dev y validado por SELECT DATABASE antes de escribir. 001–009 omitidas por estar registradas e inmutables; únicamente 010 ejecutada y registrada después de completar sus guardas. No replays ni simulaciones destructivas en desarrollo.

Tabla catálogo creada vacía; tres columnas, FK RESTRICT, índices UNIQUE y CHECK correctos, incluida clave generada VIRTUAL. Guardas SQL del propio 010 validaron metadata, índices, FK y expresiones. Registro 001–009 y sus timestamps intactos, más 010; 23 tablas después. Hashes originales de las 21 tablas de negocio idénticos, excluyendo únicamente los nuevos metadatos técnicos en el cálculo. Sin backfill, cambios manuales, períodos ni movimientos nuevos. Publicidad #3 = 50000.00, Insumos #4 = 40000.00, suma de diciembre = **90000.00**. Catálogo: cero filas.

Smoke HTTP autenticado contra la aplicación Express real y prisma_dev, con credenciales ficticias/sesiones únicamente en memoria, sin escribir admin_sessions:

| Endpoint                                | Resultado                                       |
| --------------------------------------- | ----------------------------------------------- |
| GET /api/periods/5/expense-categories   | 200, PUBLICIDAD e INSUMOS y sus dos movimientos |
| GET /api/periods/5/recurring-expenses   | 200, [] correcto                                |
| GET /api/expense-recurring-concepts     | 200, [] correcto                                |
| GET /api/statistics/summary?period_id=5 | 200, gastos 90000.00                            |

Después del smoke se repitieron hashes originales: 21/21 idénticos. No suites destructivas ni datos sintéticos en prisma_dev. Backend restablecido en 3001, watcher en segundo plano con PID inicial 3544; PID y logs locales ignorados en tmp/recurring-dev-010/backend.pid, backend.stdout.log y backend.stderr.log. El watcher original detenido fue reemplazado por este proceso; el frontend existente en 5173 se conservó.

### Verificación del propietario y límite de esta autorización

Abrir http://localhost:5173/publicidad, iniciar sesión si corresponde, recargar y seleccionar Diciembre 2026. Deben aparecer Publicidad e Insumos por $50.000/$40.000, sin los errores de esquema. Recurrentes mostrará catálogo sin configurar, sin ocho tiles todavía: es correcto. No pulsar Configurar los ocho de PRISMA hasta nueva autorización. Comprobar Estadísticas por $90.000 de gastos registrados.

Sin cambios de código, dependencias, commits, push, merge ni deploy. Producción permanece en 001–009. Próxima intervención requiere autorización expresa para configurar PRISMA; otras bases continúan fuera del alcance.

## Correcciones funcionales de Gastos recurrentes y Estadísticas — 2026-10-22

### Implementado localmente en esta continuación

- **Quitar importe** aparece únicamente al editar un movimiento recurrente canónico único. La confirmación nombra concepto, período e importe. DELETE exige ID e importe esperados, bloquea el período y las filas asociadas en transacción, y elimina solo ese registro de la categoría del período seleccionado. La categoría y el concepto permanecen; la tarjeta queda en `$ —`. Cambios concurrentes, múltiples movimientos o estado no canónico producen conflicto y no borran una suma. La invalidación de consultas actualiza Gastos y Estadísticas.
- Refinamiento visual posterior: icono del concepto y nombre comparten la fila superior con el lápiz a la derecha. El marco del lápiz mide 30×30 px y el botón conserva un área accesible de 44×44 px; el icono es de 16 px y usa el verde menta existente. Se reduce el espacio vertical y el importe queda aproximadamente 2 px menor en tarjetas amplias, con un mínimo legible en anchos estrechos. El importe sigue en formato ARS y la ausencia como `$ —`. No se rediseña el resto de Gastos.
- Se quitó el campo global «Orden» de la edición. `active` ahora se presenta como disponibilidad general del catálogo de la instalación, con explicación explícita.
- `GET /api/statistics/expenses?period_id=<id>` ofrece un snapshot read-only y agrupa una sola vez cada categoría con movimientos. Separa recurrentes/adicionales mediante el vínculo persistido, conserva categorías históricas no vinculadas como adicionales, excluye categorías vacías y devuelve importe DECIMAL, movimientos, subtotales y total. El modal **Ver desglose** verifica total y cantidad contra el KPI; los importes se denominan registrados, no pagados.

### Bloqueos del esquema 010 y propuesta, sin migración

010 solo guarda el catálogo transversal (`active`, `sort_order`) y el vínculo categoría-concepto por período. No tiene una fila de presencia ni posición de tarjeta mensual. Por ello no se implementaron **Quitar del período** ni una **Posición** editable mensual; tampoco se altera `active`/`sort_order` desde Gastos para aparentar que el cambio es local. El ajuste visual anterior sí funciona con 010 y no cambia contratos ni datos.

### Candidato de persistencia mensual para revisar (migración 011, no creada)

El puente período-concepto es preferible a guardar la presencia en la categoría: un concepto puede estar visible sin categoría ni importe, y retirar una configuración mensual no debe borrar una categoría ni su historia. Una fila representa que el concepto está presente en ese período y guarda su posición. La ausencia de fila significa que no se muestra ese concepto en ese mes.

```sql
CREATE TABLE period_recurring_concepts (
  period_id INT UNSIGNED NOT NULL,
  recurring_concept_id INT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (period_id, recurring_concept_id),
  UNIQUE KEY uq_period_recurring_position (period_id, position),
  CONSTRAINT chk_period_recurring_position CHECK (position >= 1),
  CONSTRAINT fk_period_recurring_period FOREIGN KEY (period_id)
    REFERENCES periods(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_period_recurring_concept FOREIGN KEY (recurring_concept_id)
    REFERENCES expense_recurring_concepts(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;
```

Este DDL es un candidato, no un contrato aprobado ni un archivo ejecutable. La migración candidata 011 tendría que inspeccionar instalaciones y asociaciones por ID. Para preservar las tarjetas que hoy aparecen en períodos existentes, inicializaría por cada período los conceptos globalmente activos y los inactivos que ya tengan una categoría vinculada en ese período; orden estable y posiciones compactas según `sort_order,id`. No tocaría `period_expenses`, categorías, importes, fechas, notas ni IDs y no crearía períodos. Períodos nuevos podrían recibir las disponibilidades globales al crearse explícitamente; agregar a un período existente un concepto agregado más tarde al catálogo requeriría una acción explícita. `active` solo orientaría la disponibilidad inicial, no retiraría filas mensuales ya existentes. Categorías vinculadas y movimientos permanecen independientes de la presencia.

El orden sería único y compacto de 1..N por período. El guardado de orden validaría la lista completa y bloquearía el período; para respetar el UNIQUE durante el intercambio de posiciones, movería primero las filas a un rango temporal no ocupado y luego asignaría el orden final. Bajas y altas compactarían dentro de la misma transacción. La baja del período eliminaría explícitamente sus filas puente antes del período; FK RESTRICT protegería períodos y conceptos globales con referencias.

**Retirar concepto de un período** sería una operación distinta de **Quitar importe**. Requeriría período abierto, confirmación indicando cualquier consecuencia económica y una transacción que compruebe la categoría y movimientos del concepto en ese período:

- Sin categoría ni movimientos, retirar únicamente la fila puente.
- Con categoría vacía, conservar categoría/vínculo; retirar fila puente y compactar posición.
- Con exactamente un movimiento canónico coherente, mostrar ID e importe y requerir confirmación explícita; eliminar solo ese movimiento y la fila puente atómicamente. No borrar la categoría ni tocar otros períodos. El desglose de Estadísticas sigue agrupando filas reales y la categoría vacía deja de contribuir.
- Con varios movimientos, un movimiento no canónico, marcador inconsistente o vínculo ambiguo, responder conflicto y conservar todo. No esconder una suma ni eliminar en bloque; requiere revisión por IDs.
- En período cerrado, rechazar escritura. Reagregar el concepto en un período abierto crea solo su fila de presencia/posición, nunca un importe ni un movimiento.

Las operaciones mensuales y de orden tomarían el lock del período y validarían estado/expectativas bajo la misma transacción. Los reintentos idempotentes y los conflictos de concurrencia deben dejar presencia, movimientos y orden consistentes. La asociación explícita de categoría recurrente tendría que asegurar una fila mensual de presencia o exigir que el concepto se agregue primero. Las rutas genéricas de Gastos seguirían protegiendo categorías vinculadas. Cambiar `active` global no alteraría períodos inicializados. No se propone modificar las mecánicas actuales de carga/corrección ni Pagos Facilitadores.

#### Pruebas de aceptación futuras

- Migrar desde 010: inventariar períodos, conceptos activos/inactivos, asociaciones por ID, categorías y movimientos; comprobar filas iniciales/posiciones compactas y equivalencia íntegra de todas las filas económicas, sin crear períodos.
- Meses independientes: distintos órdenes/presencias; retirar y volver a agregar en uno no cambia otros; conceptos creados después solo entran a un período existente mediante alta explícita.
- Quitar del período sin categoría, con categoría vacía, con un canónico, con múltiples o no canónicos; confirmación correcta; conflicto conserva datos; Estadísticas reconcilia por IDs antes/después.
- Quitar importe sigue dejando la presencia y tarjeta en `$ —`; no se confunde con retirar el concepto.
- Período cerrado, reapertura, baja de período, concepto inactivo con categoría histórica, categoría adicional y vínculo/desvínculo explícitos.
- Reordenamiento completo con desplazamientos e intercambios, huecos, ID ajeno, posiciones duplicadas, dos solicitudes simultáneas, reintento y rollback; siempre orden compacto único por período.
- Autenticación, control de origen, validación de payload, locking, errores parciales/reintentos de migración y compatibilidad del código con 010 hasta que 011 se aplique.

No ejecutar esta futura matriz en `prisma_dev`, `prisma_demo` ni producción; las pruebas destructivas de DB serían solo en `prisma_test` y después de autorización de implementación/migración.

#### Secuencia sugerida de commits (propuesta, no ejecutada)

1. Estadísticas: motor/contratos/endpoint y resumen, con pruebas deterministas.
2. IPC: adaptador/fuente, caché, UI y pruebas; puede integrarse separado del motor financiero.
3. Migración 010 y modelo de recurrentes actual, cuando corresponda a su etapa; el backend/UI que depende de ella va después de disponer del esquema en cada entorno.
4. Refinamiento visual actual y controles de importe, como cambio pequeño de UI; desglose de Estadísticas puede ir en una unidad propia dependiente del modelo de categorías 010.
5. Para una etapa futura: primero migración 011 y tests de esquema; después API transaccional mensual/presencia/orden; finalmente UI de administración/remoción y pruebas de integración. Documentación de cierre con cada unidad.

La secuencia se ajustará al historial real de revisión antes de integrar; no implica commits ni autorización para migraciones o despliegues.

#### Preflight, respaldo y recuperación para una futura 011

Antes de diseñar el SQL ejecutable, revisar el tipo/versionado MySQL y esquema real de cada instalación por separado. Preflight deberá confirmar de forma inequívoca `SELECT DATABASE()`, registro y estructura completa de 010, permisos, períodos existentes/estado, catálogo, asociaciones por ID, categorías, conteos/importes y ausencia de asociaciones huérfanas o duplicadas. Comparar cómo cada versión del código actual resuelve tarjetas activas e históricas. Pausar escrituras y procesos concurrentes del sistema durante la migración.

Crear antes un dump completo externo al repo; verificar exit code, lectura/estructura/datos esperados y SHA256, y documentar restauración manual. Si el respaldo no puede verificarse, detenerse. 011 debe correr solo después de 010; validar el runner de migraciones, guardas, reintentos parciales y orden de creación/backfill antes de tocar cualquier base. No restaurar automáticamente ni considerar rollback transaccional suficiente para DDL MySQL.

Postflight propuesto: 011 registrada una vez; tabla, PK, UNIQUE de posición, CHECK y FK correctas; por período, conceptos previstos visibles, IDs sin duplicación y posiciones contiguas 1..N; comparación de categorías/movimientos, IDs, fechas, notas, importes y sumas idéntica al preflight; no se crearon períodos ni movimientos; endpoints actuales y lectura de Estadísticas conservan total/conteo. La tabla puede recibir configuración, pero nunca montos. Si aparece estructura parcial, conservar logs/backup y detener escrituras; inspeccionar `information_schema` y el estado de filas y preferir reparar/reintentar hacia adelante tras validar compatibilidad. Una restauración completa sería una decisión separada, con destino/hash reconfirmados y tratamiento explícito de objetos creados después del dump.

Orden de compatibilidad futuro: primero aplicar 010 si falta y luego 011 en el entorno objetivo, validar, y recién entonces habilitar código que exija presencia/posición mensual. Entornos productivos y despliegues requieren autorización y procedimiento independiente; este documento no autoriza ninguna operación.

Validación: typecheck, lint y build aprobados; suite normal completa: 195 aprobados y 160 omitidos; suite DB específica: 1 aprobada exclusivamente en `prisma_test`, con preflight `SELECT DATABASE()` y registro 010. Tests focalizados de contratos/Estadísticas: 18 aprobados. `git diff --check` aprobado. Build conserva los dos avisos conocidos de comentarios `@__PURE__` de Zod. La prueba DB crea y retira sus fixtures en `prisma_test`, sin ejecutar 010 ni dejar datos de prueba. No se modificó ninguna base durante esta implementación.

QA visual autenticada de esta continuación: a 330 px, ocho tarjetas en una columna, sin scroll horizontal; icono y nombre juntos, lápiz a la derecha con marco de 30 px y área de interacción de 44 px, importe debajo. El primer pase mostró palabras partidas en dos columnas y se corrigió usando una columna hasta 430 px. Los breakpoints CSS mantienen dos columnas en anchos mayores, cuatro desde 760 px y ocho desde 1440 px. Falta revisión visual manual en tablet/desktop y teclado antes de integrar; el foco visible global se conserva.

Sin aplicar 010 de nuevo ni crear/aplicar otra migración; sin commits, push, merge ni despliegue. La configuración de ocho conceptos en `prisma_dev` consta como confirmación manual reciente del propietario, no como operación ejecutada en esta continuación.
