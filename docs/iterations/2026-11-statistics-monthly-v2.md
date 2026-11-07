# Iteración 11 — Estadísticas v2 mensual y anual

## Auditoría final y preparación del cierre — 07/11/2026

**Dictamen: APTO para commit funcional.** Sin defectos funcionales detectados ni correcciones de código necesarias en esta revisión focalizada. Implementado y validado localmente; revisión visual general aprobada por el propietario para escritorio/tablet/móvil según su pedido de auditoría. No integrado a main ni desplegado. El commit funcional sigue sin autorizarse ni realizarse.

Commit documental local autorizado: `e3a3bb292412a9918009c8d85734463ed4d1baf5`, `docs(workflow): document frontend visual testing procedure`. Incluye exclusivamente AGENTS.md y docs/WORKFLOW.md. Se revisó el contenido staged, incluidos los espacios y parámetros de Get-NetTCPConnection; 12 bloques PowerShell con sintaxis válida, diff-check correcto y sin diferencias unstaged en esos documentos. No se necesitó corregirlos ni stagear archivos adicionales. El registro anterior de protocolo pendiente de commit queda superado por este cierre.

- **Economía anual:** autenticación administrativa antes del router y validación del año antes de adquirir conexión; tres SELECT parametrizados en un snapshot REPEATABLE READ / READ ONLY. Pagos agrupados por cuenta antes del join; misma pertenencia mensual y motor Decimal, sin multiplicación por inscripciones/horarios. Los Number del frontend se limitan a geometría; importes exactos y cobertura permanecen en contrato/tooltips/tabla. Ausencias, indefinidos, parciales, períodos vacíos, abiertos/cerrados y años anteriores conservan sus estados. Índices compatibles según DDL existente: unique(year,month), idx_membership_period, unique(person_id,period_id) en cuentas, FK de payments.account_id e idx_enroll_period. No hay N+1 por mes; la lectura histórica transporta pares período/persona necesarios para clasificación. No se realizó un nuevo EXPLAIN ni una medición productiva de rendimiento.
- **Historia:** Set por período y persona, solo enrollments regulares; sin tablas de Eventos. Primera aparición en el historial disponible, continuidad y regreso se distinguen; enero consulta diciembre inmediato anterior. Si falta el período previo, no hay continuidad ni supuesta baja y los regresos conocidos quedan sin clasificar. Períodos inexistentes mantienen null. Los límites de historia incompleta y provisionalidad de períodos abiertos siguen explícitos.
- **Eventos:** dos tests existentes reejecutados y aprobados con fixture sintético de evento vigente, cancelado y vacío. El panel toma los totales del contrato y muestra cada evento vigente una vez, sin volver a agregarlos; el total consolidado no suma gastos ni resultados. Los gastos directos son un subconjunto de Gastos Período conforme al contrato. No muestra campos de reintegros/devoluciones, excluye cancelados y aclara que resultado comercial directo no es ganancia neta. Sin cambios al módulo Eventos ni a sus reglas.
- **Frontend:** revisión de código conserva tokens aprobados, KPI 3×2, cuatro paneles mensuales, gráficos anuales y dona con porciones iguales/relleno individual por facilitador. No se repitió la revisión visual general aprobada ni se introdujeron cambios que la invaliden.

Se reutiliza la evidencia previa de 582 pruebas aprobadas, 89 focalizadas, typecheck/lint/build y la integración anual de solo lectura en prisma_test; no son ejecuciones nuevas de esta auditoría. Las 213 omitidas en la suite general no se consideran aprobadas ni fallidas. Entre las relacionadas con estos riesgos: statistics-annual-db.test.ts se omitió en la suite general pero fue aprobada aparte; statistics-db.test.ts conserva su integración opt-in con fixtures económicos y special-events-db.test.ts cubre operaciones/integración económica de Eventos, ambas sin nueva ejecución en esta auditoría. La conciliación anual de lectura, las pruebas unitarias existentes y el fixture del panel aportan evidencia pertinente, sin afirmar que reemplazan todos esos escenarios transaccionales. Las demás suites opt-in históricas no se reejecutaron por rutina.

Los 23 archivos funcionales/QA pendientes conservaron sus hashes respecto del inicio de la auditoría. Solo se actualizan este registro y PROJECT_STATE.md para reflejar el cierre documental y el dictamen. Índice vacío tras el commit documental; sin staging funcional, push, merge, PR, cambios de esquema/MCP ni despliegue.

### Archivos funcionales/QA pendientes de commit

- Frontend (11): `client/App.tsx`, `client/Statistics.tsx`, `client/StatisticsAccordion.tsx`, `client/StatisticsAnnual.tsx`, `client/StatisticsEvents.tsx`, `client/StatisticsCollectionsChart.tsx`, `client/StatisticsExpenseChart.tsx`, `client/StatisticsFeesChart.tsx`, `client/StatisticsSkeleton.tsx`, `client/statistics-annual.ts`, `client/statistics.css`.
- Backend/contrato (4): `server/statistics/annual.ts`, `server/statistics/annual-engine.ts`, `server/statistics/index.ts`, `shared/statistics.ts`.
- QA (8): `tests/browser/statistics.tsx`, `tests/browser/statistics-events-fixtures.ts`, `tests/statistics-accordion.test.ts`, `tests/statistics-annual.test.ts`, `tests/statistics-annual-db.test.ts`, `tests/statistics-events.test.ts`, `tests/statistics-expense-chart.test.ts`, `tests/statistics-skeleton.test.ts`.

También quedan sin staging los dos documentos pertinentes de estado/cierre: PROJECT_STATE.md y este documento.

## Estado vigente — Continuación local del 07/11/2026

Implementadas la corrección visual definitiva y Evolución anual en la misma rama y base de 11.1. No desplegadas. Este apartado sustituye únicamente los criterios anteriores de seis columnas de KPI, paleta provisional y exclusión de la vista anual. El registro de 11.1 se conserva debajo como antecedente.

### Diseño y alcance

- Tokens locales aprobados: fondo `#151B1E`, panel `#222B30`, secundaria `#34464D`, cian `#68C8D3`, verde `#51B79A`, ámbar `#D0AC70`, borde `#3A4A50`, texto `#E8F1F3`, secundario `#9FAFB7`, neutro `#8D9CA5`. Barras y dona sólidas, sin degradados ni resplandores. No cambia la identidad de otras rutas.
- Seis KPI mensuales en tres columnas y dos filas desde 620 px de contenido; dos columnas en áreas menores. Cuatro paneles en dos columnas cuando caben, con Eventos debajo. Paneles independientes desplegables hasta 640 px de viewport. Los gráficos solo se montan visibles para evitar dimensiones cero en móvil.
- Encabezado propio con selector de período o año y controles Resumen mensual / Evolución anual. Cambio mínimo en `App.tsx`: evitar selectores/título duplicados en Estadísticas y aplicar su tema exclusivamente en esa ruta. El contexto expone opcionalmente la apertura del formulario existente de períodos para conservar su botón en el encabezado mensual. La navegación de otros módulos permanece.
- Se mantienen semántica económica, cobertura, tooltips, tablas accesibles, reintentos, estados vacíos, Skeletons, IPC mensual y dona por facilitador con relleno individual según porcentaje pagado. Sin KPI anuales, reintegros/devoluciones visibles, flujo de caja, ganancia neta ni IPC histórico.

### Contrato y fuentes anuales

`GET /api/statistics/annual?year=AAAA`, protegido por la autenticación administrativa existente, con contrato aditivo `statisticsAnnualSchema` en `shared/statistics.ts`. No modifica consumidores mensuales ni MCP. El año se valida antes de adquirir conexión. Respuesta agregada sin IDs de personas/cuentas: 12 meses, período/estado nullable, métricas mensuales exactas due/collected con cobertura, participantes, continuidad, incorporaciones, motivos de comparación no calculable, fecha de lectura e inicio/límites del historial.

Tres consultas parametrizadas para cualquier cantidad de meses, dentro de REPEATABLE READ / WITH CONSISTENT SNAPSHOT / READ ONLY: períodos hasta el año elegido; miembros y cuentas/cobros del año con pagos preagregados por cuenta; pares distintos período/persona de inscripciones regulares del historial disponible. Sin joins a horarios/plazas que multipliquen personas o dinero; sin consultas por mes en producción, migraciones, cambios de esquema ni escrituras. Se liberan conexiones también ante errores.

`annual-engine.ts` reutiliza `calculateSummary` por cada mes con las mismas filas económicas y reglas del resumen mensual. No crea fórmulas financieras nuevas: cobrado incluye cobros registrados, sobrepagos y cuentas indefinidas según su universo mensual; no se sustituye por obligación cubierta. Dinero exacto en strings/Decimal, conversión Number exclusivamente para geometría en React.

Participantes deduplicados por persona/mes desde enrollments, sin Eventos ni inferencias de asistencia. Continuidad compara los meses calendario inmediatamente consecutivos, incluido diciembre anterior para enero. Sin período anterior o con base anterior vacía, no se representa una supuesta pérdida. Primera inscripción en el historial disponible = nueva; ya presente anteriormente y ausente del mes inmediato anterior existente = reincorporada; si falta ese mes, el regreso queda sin clasificar. Cambios de actividad no cuentan como nuevas incorporaciones.

Un período inexistente devuelve null, no cero. Un período existente sin cuentas/inscripciones muestra cero registrado y su estado explícito. Importes totalmente indefinidos no producen puntos de obligación cero. Huecos de las líneas sin unir meses ausentes, puntos visibles con un solo mes, series con leyendas/controles, tooltips exactos y alternativas tabulares con cobertura y abierto/cerrado. La lectura es actual, no un snapshot contable congelado. El historial disponible puede omitir inscripciones anteriores a la implantación/importación o eliminadas; no acredita una primera participación vitalicia ni integridad histórica.

### Validación de esta continuación

Pruebas focalizadas: 89 aprobadas; nueva integración MySQL de solo lectura aprobada exclusivamente en prisma_test, comparando consulta anual, motor mensual y conteo DISTINCT dentro del mismo snapshot, sin crear ni limpiar fixtures. La prueba selecciona el año con mayor cantidad de membresías existentes; casos económicos y conjuntos límite adicionales se verifican con pruebas unitarias sintéticas. Suite general final: 582 aprobadas y 213 omitidas (42 archivos aprobados y 11 omitidos). Las omitidas incluyen la nueva integración DB, que fue aprobada separadamente; no se ejecutaron las suites destructivas históricas. Typecheck, lint, build y diff-check aprobados. Build con los avisos no bloqueantes de anotaciones de Rollup en Zod ya observados en 11.1; sin cambios de dependencias.

Navegador integrado accesible después de comprobar servidor existente en 127.0.0.1:5173 y HTTP 200 de la página QA exacta; no se inició Express/MySQL ni se detuvo el servidor del propietario. La inspección de sockets necesitó salir del sandbox por el bloqueo CIM. El intento de inicio con strictPort terminó al detectar el puerto ocupado; se reutilizó el servidor existente sin cambiar puerto ni terminar procesos ajenos.

QA visual sintética completada, con capturas inspeccionadas en el navegador del chat:

| Vista / viewport CSS observado | Evidencia                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escritorio, 1440×901           | Seis KPI en tres columnas y dos filas; cuatro paneles anuales, cuatro gráficos cargados, sin KPI anuales; colores sólidos y sin gradientes SVG; tooltip financiero exacto y foco visible al navegar con flechas. |
| Tablet, 794×1016               | Dos paneles por fila con navegación contraída; una columna cuando el menú expandido reduce el contenido por debajo de 620 px. Sin desbordamiento horizontal.                                                     |
| Móvil, 397×857                 | Título y selector contextual visibles; KPI en dos columnas; paneles independientes; apertura por Enter; cambio de período abierto/cerrado y de año; dona sólida y vacíos de Gastos/Eventos.                      |

Se verificaron un año con un solo mes (puntos aislados reales de QA), año vacío, error anual con reintento, parciales, indefinidos sin punto de obligación cero, meses ausentes en tabla y controles de series. La carga manual mostró el Skeleton anual y su sustitución por datos al liberar la respuesta. La tabla tiene una región desplazable con foco para teclado. En la recarga final de la página normal no se registraron errores ni advertencias de consola; los errores del escenario `annual=error` son intencionales. No se observaron desbordamientos de página en los tamaños comprobados. Los avisos iniciales de dimensiones cero en gráficos ocultos se corrigieron montándolos únicamente visibles; los errores de createRoot durante hot reload del fixture no se reprodujeron tras recargar la página final.

Contraste calculado de tokens frente al panel: texto 12,57:1, secundario 6,38:1 y acentos/neutro entre 5,10:1 y 7,41:1. Es una comprobación básica, no una auditoría de todos los estados ni con lector de pantalla. La animación de gráficos anuales está deshabilitada; las pruebas existentes de Skeletons y movimiento reducido pasaron. La preferencia del sistema operativo no se cambió ni se acredita una verificación visual completa de esa preferencia. QA con datos sintéticos e integración dirigida en prisma_test; no prueba productiva ni aceptación final del propietario.

Escenarios nuevos en la página QA existente: `annual=few`, `annual=empty`, `annual=error`, además de `collections=unknown` y controles `loading=manual` (incluye Liberar lectura anual). Los fixtures financieros mensual/anual comparten una fuente sintética de entradas y el mismo motor; nunca se importan desde el entrypoint productivo.

Cambios preexistentes de AGENTS.md y WORKFLOW.md en staging al iniciar esta continuación: preservados sin edición ni operaciones de índice. Sin staging, commits, push, merge, PR, acceso a producción ni despliegue por Codex en esta ejecución.

### Archivos intervenidos en esta continuación

- Frontend: `client/App.tsx`, `client/Statistics.tsx`, `client/StatisticsAccordion.tsx`, `client/StatisticsAnnual.tsx` (nuevo), `client/statistics-annual.ts` (nuevo), `client/StatisticsCollectionsChart.tsx`, `client/StatisticsExpenseChart.tsx`, `client/StatisticsFeesChart.tsx`, `client/StatisticsSkeleton.tsx` y `client/statistics.css`.
- Backend/contrato: `server/statistics/annual.ts` y `annual-engine.ts` (nuevos), `server/statistics/index.ts`, `shared/statistics.ts`.
- QA: `tests/browser/statistics.tsx`, `tests/statistics-annual.test.ts` y `tests/statistics-annual-db.test.ts` (nuevos).
- Documentación: este documento y `docs/PROJECT_STATE.md`. Se conservan los demás cambios pendientes de 11.1 y los dos archivos del protocolo previamente staged. No se agregan capturas binarias al repositorio.

## Antecedente conservado — Iteración 11.1

Fecha: 07/11/2026. Implementación local sobre `3077d19`, limpio e idéntico a `origin/main` tras fetch. Rama: `codex/iteration-11-1-statistics-monthly`. Sin staging, commits, push, merge, PR ni despliegue.

## Decisiones de presentación

- Seis KPI al inicio; paneles de Cobranzas, Inscripciones, Gastos y Honorarios, seguidos por ingresos por origen y Eventos.
- Dos columnas desde 620 px de contenido disponible; una por debajo. KPI en dos, tres o seis columnas según espacio (620 y 1050 px). Se evita comprimir gráficos cuando la navegación lateral reduce el área útil en tablet.
- Paneles siempre visibles en escritorio/tablet. Hasta 640 px de viewport, botones con aria-expanded y aria-controls; contenido cerrado oculto mediante hidden. Cobranzas inicia abierto; los otros paneles cerrados. Estados independientes conservados al cambiar de período y tamaño.
- Se conservan gráficos, tooltips, alternativas accesibles, controles, cobertura, conciliación y reintentos. Gastos y Honorarios se componen por separado con sus propias consultas. Inscripciones incorpora Skeleton y reintento.
- Paleta local carbón/pizarra/cian moderado, sin cambiar el tema global. Honorarios conserva porciones iguales por facilitador y relleno según porcentaje individual pagado; no representa peso económico.
- Eventos usa exclusivamente `summary.events`: income.workshops/events/total, event_expenses y commercial_result. Detalle vigente por número/nombre/fecha, commercial.gross, direct_expenses y commercial.result. Se excluyen cancelados y no se presentan reintegros/devoluciones. No se recalculan importes financieros en la interfaz.

Esta presentación sustituye los acuerdos históricos de navegación por acordeones generales y su paleta para el alcance mensual de `2026-10-statistics-design.md`. Las reglas económicas, cobertura y demás decisiones históricas siguen vigentes. La maqueta HTML es referencia visual, no fuente de datos ni instrucciones operativas.

## Diferencias deliberadas con la maqueta

Se mantienen los tres gráficos reales (incluida la dona), el total consolidado de ingresos y las advertencias existentes. No se incorporan las barras ilustrativas de honorarios, la vista anual, su selector ni los datos/cálculos simulados de la maqueta. Los fixtures de QA se limitan a tests/browser; no forman parte del entrypoint productivo.

## Validación y límites

Typecheck, lint, build y `git diff --check` aprobados. Suite completa: 572 pruebas aprobadas y 212 omitidas (41 archivos aprobados y 10 omitidos), incluyendo las pruebas focalizadas de Estadísticas. Nuevas aserciones para visibilidad de paneles en escritorio/tablet, relaciones accesibles y ocultamiento en móvil, e importes/detalle/vacío de Eventos sin exponer movimientos ni cancelados. Se conservan pruebas de cobertura, errores, conciliación, caché, respuestas tardías y Skeletons. No se ejecutaron pruebas DB ni migraciones. Vitest necesitó ejecución fuera del sandbox por EPERM al renombrar su caché temporal; la ejecución inicial bloqueada no produjo resultados de tests. Build con avisos no bloqueantes de anotaciones de Rollup en Zod, sin cambiar dependencias.

La revisión visual de escritorio/tablet/móvil, cambio de período, carga, datos parciales y ausencia de registros queda pendiente: el navegador integrado falló al conectar a localhost (connection refused/timeout) y el control de Chrome fue detenido por no poder determinar su URL con confianza. No se eludió ese control. Las pruebas de marcado y caché no sustituyen una inspección visual ni una prueba con lector de pantalla.

Página sintética de QA: `http://localhost:5173/tests/browser/statistics.html`; parámetros existentes `collections=empty`, `collections=partial`, `expenses=empty`, `expenses=error`, `fees=unknown` y `loading=manual`. Septiembre ofrece gastos y eventos vacíos; el selector permite revisar cambios de período. No usar estas páginas como datos de producción.
