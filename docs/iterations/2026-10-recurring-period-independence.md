# Iteración 8 — Independencia mensual de gastos recurrentes (011)

Fecha: 2026-10-22. Implementación local aprobada por Hernán. Sustituye la propuesta histórica de una sola tabla del informe anterior. No implica integración Git, activación en desarrollo ni actualización productiva.

## Implementación y contrato definitivo

- `period_recurring_settings`: una fila por período explícitamente existente, `revision BIGINT UNSIGNED DEFAULT 0`, PK/FK RESTRICT a `periods`.
- `period_recurring_concepts`: PK `(period_id, recurring_concept_id)`, posición entera positiva única por período, timestamps, FK RESTRICT a settings y catálogo. Orden compacto 1..N.
- La presencia depende exclusivamente de estas filas. Una tarjeta retirada no reaparece al consultar, cambiar el catálogo o reejecutar SQL registrado. `active` global solo participa en la inicialización de períodos nuevos; no oculta presencias existentes.
- Crear un período, vacío o por clonación, inicializa el catálogo activo en la misma transacción, sin categorías, movimientos ni importes. Un concepto nuevo requiere incorporación explícita a meses existentes. Los cerrados requieren reapertura.
- `GET /api/periods/:periodId/recurring-expenses` devuelve `{revision, tiles}`. Revisión decimal como texto en JSON y SQL CAST a CHAR, sin precisión perdida por Number. Límite uint64 validado; valores malformados producen error de contrato.
- Toda mutación mensual exige revisión: agregar/quitar presencia, posición, guardar/quitar importe, vincular/desvincular categoría. `peopleTransaction`, lock de período, bloqueo de settings y comparación de revisión serializan cambios; revisión obsoleta responde 409. El cierre/reapertura comparte el lock de escritores. Rollback conserva presencia, orden y movimientos si falla cualquier paso.
- Posición desplaza las demás tarjetas y compacta usando un rango temporal sin colisiones con UNIQUE. No cambia ningún otro mes.
- Quitar importe elimina solo el canónico confirmado y conserva tarjeta/categoría. Quitar del período retira presencia; sin dinero conserva la categoría vacía; con un movimiento canónico exige confirmación por ID, concepto, fecha, importe y notas, y lo elimina en la misma transacción. Varios/no canónicos bloquean. Reincorporar agrega al final sin importe, reutilizando el vínculo vacío existente.
- UI: Configurar separa configuración mensual de catálogo reutilizable; posición accesible 1..N, retiro con confirmación del mes y efecto económico, selección explícita de ausentes y errores de conflicto. Tiles conservan sus estilos y composición anteriores. Formularios capturan revisión inicial para detectar cambios concurrentes.
- Estadísticas continúa calculando a partir de movimientos reales, sin filtrar por presencia o actividad del catálogo. No se alteraron IPC, honorarios, adicionales ni fórmulas contables. Movimientos vinculados sin presencia se diagnostican explícitamente en lectura mensual y permanecen en Estadísticas.

## Migración y respaldo de prisma_test

Preflight anterior a la primera escritura: MySQL 8.4.11, SELECT DATABASE() inequívocamente prisma_test, migraciones 001–010, ausencia de estructuras parciales, permisos revisados, lock de escritores y ausencia de otras sesiones en esa base. Inventario de conteos y hashes por tabla. Se preservó el trabajo Git existente.

Respaldo completo externo, mysqldump terminado correctamente, contenido legible y presencia de CREATE/INSERT para tablas y datos esperados:

`C:/Users/Hernán/prisma-crm-backups/2026-10-22T21-11-19.420Z-pre-011-prisma_test/prisma_test.sql`

SHA256: `138791593415c3f67c73607e2b194c682e26ef10b95fb8ec3474becf6be2401c`

El directorio contiene `before.json`, `after.json` y `RECOVERY.md`. No se incorporaron respaldo ni secretos a Git. Se verificó el dump, pero no se realizó un ensayo de restauración.

011 fue aplicada con el runner existente hasta `011.sql`, después del respaldo. Se comprobó recuperación desde la primera tabla durable y replay registrado sin reinicializar presencias. Los guards de SQL comprueban columnas, índices, FK y CHECK y rechazan parciales incompatibles; el backfill exige configuración de revisión cero compatible con el conjunto esperado. MySQL DDL no revierte mediante rollback: no habilitar escritores hasta completar registro y postflight.

SHA256 del archivo 011 validado: `94b1a2f169c67727be66eedbd97bf286e6d1d04bc567d0ee5ef9cd751b0c436c`.

Backfill: conceptos activos para cada período existente más inactivos con categoría vinculada en ese período, orden estable `sort_order,id`. No crea períodos ni modifica datos económicos. La base original tenía catálogo vacío: resultado real 70 settings y cero presencias. El caso activo/inactivo/vinculado/cerrado se comprobó además con fixture transaccional y rollback; no se infiere cobertura del caso complejo solo del catálogo vacío.

Al retomar se verificaron mediante lectura registro 011 y ambas tablas. La corrida final de regresión no volvió a ejecutar migración/backfill; esos escenarios requieren el flag adicional `RUN_RECURRING_MIGRATION_REPLAY_TESTS=true` y revisión operativa independiente.

## Integridad final

Después de retirar todas las fixtures, auditoría de solo lectura contra el manifiesto previo: **22 tablas originales con cantidades y hashes de filas idénticos**. Se excluye únicamente schema_migrations porque recibió 011. Conservados: 70 períodos, 8 categorías y 5 movimientos. Catálogo original vacío y presencias cero; settings 70. No quedaron conceptos, períodos ni movimientos de QA. Las secuencias AUTO_INCREMENT pueden avanzar por las fixtures, incluso con rollback; no se reiniciaron.

No se modificaron prisma_dev, prisma_demo ni producción. Los $90.000 de diciembre de prisma_dev pertenecen a verificaciones anteriores; no se presenta una nueva auditoría de esa base en este trabajo.

## Validación

- Typecheck y lint aprobados.
- Suite normal final: 197 aprobados; 162 omitidos (integraciones opt-in).
- Regresión DB final: tres suites, tres casos integrales aprobados y un caso de replay omitido deliberadamente. Comandos bajo DB_NAME=prisma_test y flags RUN_RECURRING_PERIOD_DB_TESTS, RUN_RECURRING_REMOVAL_DB_TESTS y RUN_RECURRING_DB_TESTS, sin paralelismo entre archivos.
- Backfill transaccional y replay: aprobados en el pase anterior; no repetidos en el cierre. Recuperación parcial también aprobada durante la operación inicial.
- Cobertura funcional: inicialización/clonación sin dinero; conceptos activos/inactivos; independencia mensual; posiciones/compactación; altas/bajas/reincorporación; monto único confirmado; múltiples bloqueados; período cerrado; expectativas obsoletas; doble envío; dos operaciones con la misma revisión (una gana y otra recibe conflicto); rollback por overflow uint64 después de eliminar; revisión mayor que Number.MAX_SAFE_INTEGER; FK/CHECK; autenticación y origen; rutas genéricas protegidas; conciliación de desglose y resumen con las filas económicas.
- Prueba de falta de 011 con DB simulada: 503 explícito y ninguna escritura, sin conectarse a prisma_dev.
- Fixtures económicas reservan un año comprobado libre; se abortó correctamente el primer intento con 2098 ocupado y luego se seleccionó uno libre. Cada cleanup usa solo IDs propios. No se ejecutó la suite destructiva general de integración.
- UI real autenticada en servidor QA separado, conectado exclusivamente a prisma_test, año libre 2091 y sesiones en memoria: posición, retiro y reincorporación de Alquiler en enero; febrero conserva ocho tarjetas en su orden; reincorporación muestra `$ —`. Fixtures retiradas y servidor detenido.
- Responsive: medidas DOM en 390, 700, 701, 1024, 1440, 1700 y 1920 px sin overflow horizontal; ocho tiles y word-break normal. Una columna a 390, dos a 700/701, cuatro a 1024/1440/1700 y ocho a 1920 según espacio disponible del contenedor. Diálogo mobile: Tab alcanza el campo numérico y Escape cierra. No se realizó auditoría exhaustiva con lector de pantalla. Algunas capturas emuladas del navegador quedan recortadas por el panel de la aplicación; las medidas DOM son la evidencia de ancho, no una certificación visual completa en cada dispositivo.
- Build aprobado; mantiene dos avisos conocidos de anotaciones @**PURE** de Zod. Diff check aprobado. Sin dependencias nuevas.

Evidencia local no versionada: `tmp/recurring-011-final-audit.json`, `tmp/qa011-desktop.png` y capturas por ancho. No contienen credenciales reales ni dumps.

## Activación posterior en prisma_dev — no ejecutada

Requiere autorización independiente. Hasta entonces recurrentes y creación/edición/eliminación de períodos que necesitan 011 muestran 503; no existe fallback a disponibilidad global. Estadísticas y lectura económica siguen dependiendo de 010, sin ocultar movimientos. No recomendar probar escrituras de 011 contra dev antes de activarla.

1. Releer instrucciones y estado Git; conservar trabajo. Confirmar hash de 011 contra el validado y 001–010 registradas. Confirmar SELECT DATABASE() = prisma_dev, host, permisos, versión y ausencia/compatibilidad de estructuras parciales. Cualquier diferencia exige detener esa parte.
2. Detener servidores/procesos que escriban, revisar sesiones y adquirir el lock de escritores del proyecto en conexión dedicada. Mantener la exclusión durante respaldo, migración y postflight; el lock de migración por sí solo no excluye escrituras de aplicación.
3. Inventariar conteos y hashes de todas las tablas originales, catálogo activo/inactivo, vínculos por ID y conjunto esperado por período (también cerrados), y gastos de diciembre. Comprobar Publicidad ID 3 = 50000.00 e Insumos ID 4 = 40000.00 y total 90000.00 contra los datos reales antes de seguir.
4. Generar dump completo fuera del repositorio con mysqldump compatible, resultado exitoso, sin secretos en argumentos/logs, SHA256, lectura y verificación de estructuras/datos. Registrar procedimiento de recuperación. Si no se verifica, no migrar.
5. Ejecutar el runner del proyecto limitado a migrate('011.sql'), con DB_NAME explícito y preflight en el mismo proceso. No ejecutar SQL manual para alterar históricos ni migraciones anteriores. El runner debe encontrar 001–010 ya registradas y aplicar únicamente 011.
6. Verificar registro, estructuras, restricciones y coincidencia exacta del conjunto esperado y posiciones 1..N. Comparar todas las filas originales por hashes; revisar gastos y $90.000. No configurar conceptos ni crear importes como efecto secundario. Verificar endpoints autenticados y UI en lectura; habilitar escritores solo después del éxito.
7. Ante fallo: mantener escritores detenidos, conservar dump y evidencia, inspeccionar aplicación parcial y registro. Preferir completar hacia adelante solo si guards y estado son compatibles. No restaurar automáticamente: requiere autorización explícita. Una restauración debe reconfirmar destino/hash, inventariar objetos nuevos ausentes del dump y usar cliente mysql dirigido únicamente a prisma_dev; no suponer que importar el dump elimina tablas nuevas. No realizarla como parte de este informe.

Producción permanece en 001–009 según confirmación previa; integración, orden 010→011 y despliegue son operaciones futuras separadas del propietario.

## Archivos y Git

Rama `codex/iteration-8-statistics-design`, HEAD `dcee416`, conservado. Nada staged; sin commits, push, merge ni despliegue. Working tree contiene también todos los cambios previos de Estadísticas/IPC/010/UI, que no deben atribuirse íntegramente a esta continuación.

Esta continuación modifica/agrega: server/migrations/011.sql, server/recurring-periods.ts, server/recurring-expenses.ts, server/scheduling.ts, server/configuration-deletion.ts, shared/recurring-expenses.ts, client/RecurringExpenses.tsx; contratos y suites recurring-expenses, recurring-amount-removal, recurring-periods; ARCHITECTURE, DECISIONS, PROJECT_STATE, ROADMAP y los documentos de iteración relacionados. El CSS de los tiles se preservó.

Plan de commits posterior, sin staging ejecutado:

1. Estadísticas v1/IPC y sus contratos/pruebas/documentación, aislando los hunks de gastos recurrentes.
2. Modelo 010 y catálogo/importes/históricos recurrentes, frontend y pruebas compatibles con esa etapa.
3. Independencia mensual 011, helpers/backend/contratos/frontend y tests actualizados, como unidad compatible; requiere 010. No publicar el frontend que espera snapshot contra un backend que devuelve array ni activar estos cambios con DB en 010.
4. Documentación de cierre, runbook, validaciones y Roadmap, ajustando cada documento a los commits funcionales correspondientes. Alternativa si separar estados intermedios exige reconstrucción arriesgada: agrupar 2+3 y explicar ambas migraciones, revisando el diff completo.

No usar git add indiscriminado: existen archivos compartidos con trabajo anterior. Revisar hunks y validar cada unidad antes de cualquier commit autorizado.

## Pendientes y límites

Revisión de Hernán; autorización/backup/activación de 011 en prisma_dev; integración y producción; ensayo de restauración en entorno autorizado; auditoría completa de accesibilidad. Configurar catálogos en otras instalaciones no está autorizado. Estadísticas anuales e históricas figura como pendiente tanto en Roadmap como en diseño funcional: vista anual, rangos históricos, IPC mensual oficial y nominal/ajustado, Recharts futuro y decisión de ubicación visual; sin consultas, filtros, gráficos ni migraciones de esa ampliación.

## Activación controlada de 011 en prisma_dev — completada 2026-10-22

Esta actualización supera las menciones anteriores a activación pendiente en desarrollo. Autorización expresa de Hernán para prisma_dev exclusivamente. Sin cambios funcionales, commits ni publicación.

Preflight: host 127.0.0.1:3306, servidor DESKTOP-T8CHG05, SELECT DATABASE() = prisma_dev, MySQL 8.4.11. Migraciones exactamente 001–010; ninguna estructura parcial de 011. Permisos de DDL/lectura/inserción verificados sin registrar credenciales. SHA256 de 011 coincide con la versión validada: 94b1a2f169c67727be66eedbd97bf286e6d1d04bc567d0ee5ef9cd751b0c436c.

Catálogo: ocho conceptos; Alquiler, Luz, Gas, Internet, Agua, Impuestos y Cobertura activos; Expensas inactiva con categoría vinculada en diciembre. Se conservaron nombre Cobertura y disponibilidad real. Categorías/movimientos e importes de diciembre comprobados antes de migrar: Publicidad ID 3 = 50000.00; Insumos ID 4 = 40000.00; Alquiler ID 5 = 500000.00; Expensas ID 6 = 270000.00. Total real 860000.00, cuatro movimientos; la referencia antigua de 90000.00 corresponde solo a adicionales.

Exclusión de escritores: watcher y backend locales identificados y detenidos; Vite conservado. Sin otras sesiones prisma_dev ni eventos programados habilitados al preflight. Lock prisma_dev:people mantenido durante inventario, dump, migración y postflight; runner adquiere adicionalmente su lock de migración. Backend reiniciado después de éxito. No se detuvieron procesos ajenos.

Respaldo completo externo: C:/Users/Hernán/prisma-crm-backups/2026-10-22T23-32-50.941Z-pre-011-prisma_dev/prisma_dev.sql

SHA256 del respaldo: c4fee13bb0ad46d62badff1689631f0adf96511691dd563f16939cb3473f62cc.

mysqldump terminó con exit code 0, marcador de finalización y CREATE/INSERT esperados para cada tabla con datos; archivo legible. before.json contiene cantidades/hashes previos; after.json contiene postflight, presencias esperadas, totales y lecturas. RECOVERY.md documenta recuperación: detener escritores, reconfirmar destino y hash, inspeccionar parcialidad y objetos nuevos; preferir completar hacia adelante compatible. Restaurar requiere autorización separada y tratamiento explícito de tablas nuevas no incluidas en el dump; no se restauró ni ensayó restauración. Respaldo fuera de Git.

Aplicación: únicamente migrate('011.sql') mediante runner oficial, sin alterar 001–010 ni ejecutar replay, fixtures o pruebas destructivas. Registro 011 confirmado. Guards del SQL validaron columnas, índices, FK RESTRICT y CHECK. Backfill exacto frente al conjunto esperado: tres settings revisión cero y 22 presencias: siete en cada uno de los períodos 1 y 2 y ocho en diciembre (ID 5). Posiciones únicas/compactas, ninguna configuración faltante. Expensas conservada en diciembre por su vínculo histórico; no agregada en los meses sin vínculo donde estaba inactiva.

Postflight: las 22 tablas originales conservan exactamente cantidades y hashes de filas; solo schema_migrations recibe el registro autorizado y se agregan las dos tablas de configuración. No se crearon categorías, importes, períodos ni movimientos. Totales preservados: período 1 = 15000.00, período 2 = 30000.00, diciembre = 860000.00. Resumen y desglose de Estadísticas concilian exactamente con cada suma SQL. Los cuatro movimientos de diciembre conservan todos sus campos y timestamps según hashes.

HTTP: app real con autenticación y sesión de verificación en memoria, sin registrar sesiones en DB: GET recurrentes de diciembre 200 (ocho tiles), categorías 200, desglose 200 y resumen 200 (ambos 860000.00). No se ejecutaron mutaciones HTTP. Lectura del módulo backend confirmada también en los otros meses con gastos. Backend de desarrollo restablecido; Vite sigue en 5173.

Prueba manual para Hernán: abrir http://localhost:5173/publicidad, ingresar con su sesión habitual y seleccionar Diciembre 2026. Confirmar ocho tiles en orden, Alquiler $500.000, Expensas $270.000, los restantes sin importe; Publicidad $50.000 e Insumos $40.000 en adicionales. En Estadísticas verificar Gastos registrados $860.000 y desglose recurrentes $770.000 + adicionales $90.000. Abrir Configurar solo para consultar posición; cerrar sin guardar. Comparar otros meses: siete tiles, Expensas ausente por estado previo inactivo sin vínculo. Carga, retiro, reincorporación y cambio de posición sobre datos existentes quedan para revisión/prueba manual posterior, no realizados por Codex.

Riesgos y pendientes: DDL MySQL durable; respaldo verificado sin ensayo de restauración; auditoría exhaustiva de accesibilidad sigue pendiente. No se modificaron prisma_test, prisma_demo, producción ni SiteGround en esta activación. Git permanece en codex/iteration-8-statistics-design, HEAD dcee416, trabajo previo preservado y nada staged; esta intervención agrega únicamente este registro documental y la actualización de estado. Sin commits, push, merge ni despliegue.

## Cierre local y aprobación manual de Hernán

Hernán confirmó las pruebas manuales satisfactorias en prisma_dev sobre el período diciembre de 2026: importes y conciliación de $860.000, posiciones independientes entre períodos, renumeración, retiro de Luz sin importe, persistencia entre períodos y reincorporación. Esta aprobación corresponde a esos recorridos y no amplía la evidencia manual a eliminación de movimientos con importe, concurrencia, rollback, recuperación o restricciones de integridad: esos casos conservan únicamente la cobertura automatizada/técnica ya registrada.

Cierre Git autorizado en tres commits locales dependientes: migraciones 010–011; implementación integrada de Estadísticas/IPC/Gastos Recurrentes y pruebas; documentación. No se repitieron suites extensas ni auditorías DB durante este cierre porque no hubo cambios funcionales. Fetch de origin realizado antes de los commits: main local dcee416 está un commit documental por delante de origin/main 06f3d1f, sin divergencia inesperada. Main no se modifica. Integración, respaldo/migraciones productivas 010→011 y publicación permanecen pendientes de autorización y ejecución del propietario.
