# Paso 3C — protección de pruebas destructivas

Fecha: 10/11/2026. Informe local para revisión del propietario.

## A. Resultado general

Implementación local y corrección final de concurrencia completadas; validaciones seguras registradas en F. Dictamen para commit local: **APTO CON OBSERVACIONES**, por la ejecución remota pendiente. La integración MySQL real y el workflow remoto no se ejecutaron: no se declara aceptación de esa integración. No se abrió ninguna conexión MySQL ni se alteraron bases, identidades, sesiones o respaldos. No se cambió de rama ni se crearon commits.

## B. Problemas encontrados

- integration.test.ts activaba el recorrido general con RUN_DB_TESTS; resetTestSchema eliminaba tablas de negocio y schema_migrations, sin retirar las tablas de identidad. Podía dejar datos institucionales con un historial de migraciones incompatible. Los casos de gastos, membresías y cobros también retiraban registros de migraciones y repetían DDL.
- Las guardas de fixtures y casos aceptaban prisma_test por nombre declarado o SELECT DATABASE(). Ese nombre ahora corresponde a datos reales de aceptación local.
- Identidad, bindings, OIDC y B2 ejecutaban migraciones, fixtures y teardown mediante RUN_DB_TESTS. Las suites de bootstrap requieren institución sintética vacía; sus guardas de nombre/host no acreditaban un destino descartable.
- Know-How/propuestas, recurrentes y replay, Estadísticas y lecturas AI tenían opt-ins independientes. Algunas borraban tablas, filas o registros de migraciones; otras insertaban fixtures con rollback. Revisar solo RUN_DB_TESTS dejaba caminos sin cubrir.
- Eventos fijaba el nombre de la QA conservada y, en migraciones, el usuario/puerto local. Esa QA ya no es un destino reinicializable.
- applyCleanup y qa:cleanup --apply validaban plan, huellas y nombre efectivo, pero admitían bases conservadas. El script histórico setup-local-db creaba esquemas conservados y rotaba contraseñas de cuentas sin acreditar una instancia temporal.
- CI usaba prisma_test en su servicio efímero; las instrucciones operativas mezclaban ese entorno con la base local homónima.

## C. Correcciones implementadas

La política y el procedimiento completos tienen una única fuente: [WORKFLOW §6](../WORKFLOW.md#6-tests-db).

- server/disposable-database.ts centraliza validación de nombre, autorización explícita y acreditación de la conexión efectiva.
- tests/db-safety-setup.ts y tests/guarded-mysql.ts interceptan mysql2/promise mediante el setup de Vitest. Cubren createPool, query/execute, getConnection y createConnection; migraciones, transacciones, aplicación HTTP y teardown usan esa frontera. Una conexión rechazada se destruye. Se verifica cada adquisición, sin cachear una aprobación global.
- vitest.config.ts incorpora ese setup y conserva la configuración Vite existente.
- Las suites y fixtures afectados sustituyen el destino fijo por disposableDatabase(). Eventos conserva su expectativa de baseline y admite el marcador como única tabla de una instalación vacía; elimina el acoplamiento al usuario y puerto de la instancia conservada.
- applyCleanup exige autorización antes de conectar y comprueba el marcador dentro de la misma conexión transaccional antes de borrar. Conserva sus revisiones y huellas. Generar planes no borra.
- setup-local-db.ts queda retirado: aborta antes de abrir conexiones, crear bases o alterar usuarios.
- test:unit ejecuta Vitest en un proceso hijo con opt-ins DB conocidos desactivados y autorización destructiva vacía, aunque existieran valores heredados o en .env.
- CI prepara una acreditación en un servicio Docker independiente por suite y conserva la cobertura previamente habilitada, con la corrección de concurrencia detallada en E.
- AGENTS, README, WORKFLOW, QA, V1, MODELO-PERIODOS, PROJECT_STATE y documentos de identidad vigentes remiten al procedimiento actual. La evidencia histórica y la aceptación B2 se conservan.

## D. Protección de bases

prisma_dev, prisma_demo, prisma_test y prisma_qa_events_102_20261106 se rechazan expresamente, incluso con autorización, UUID, token y flags CI presentes. También se rechaza cualquier nombre fuera del prefijo descartable. La conexión debe devolver exactamente el esquema declarado y el UUID del servidor previamente acreditado; el marcador debe contener exactamente una fila con UUID y token coincidentes.

Sin autorización o acreditación completa se aborta antes de abrir la conexión. Si el destino real difiere o falta el marcador se permiten únicamente las lecturas de comprobación y se destruye la conexión. Los tests nunca crean ni reparan ese marcador. No se modificaron migraciones aplicadas ni autenticación administrativa.

Límite explícito: la guarda previene accidentes en las rutas identificadas; no protege frente a código malicioso que desactive el setup o utilice credenciales privilegiadas por otro canal. El aislamiento y los grants del entorno temporal deben prepararse según WORKFLOW; la guarda no los audita. Las migraciones manuales siguen requiriendo su procedimiento controlado y autorización independiente.

## E. Compatibilidad con CI

La revisión de cierre detectó una condición preexistente conservada: la fase general podía ejecutar integration.test.ts (reset/DDL), identity-db.test.ts (migraciones) y statistics-annual-db.test.ts (lecturas sin preparación propia) en paralelo sobre el mismo esquema. El lock del migrador no cubría el reset ni las lecturas. El dictamen de esa revisión fue NO APTO hasta corregirlo.

Corrección final: verify ejecuta lint, build y test:unit sin servicio MySQL. integrations depende de su éxito y usa una matriz de seis suites con max-parallel: 1 y fail-fast: false. Cada entrada inicia un servicio mysql:8.4 nuevo que crea prisma_disposable_ci y prisma_ci, exclusivamente dentro de ese runner. La acreditación sigue ligada por docker exec al ID del servicio de esa entrada, con UUID y token nuevos. Cada job ejecuta un único archivo mediante --no-file-parallelism y hookTimeout de 30 segundos. GitHub puede elegir el orden de la matriz: ninguna suite depende de él ni del estado dejado por otra. No se comparte esquema entre jobs y no se habilitan flags optativas nuevas.

Baselines: integración general prepara su recorrido desde 001; identidad prepara 001–016 y prueba 017; bindings prepara 001–018 e institución vacía; OIDC prepara 001–018 y prueba 019; B2 prepara 001–019 e institución vacía. Estadísticas anual ahora exige un esquema con solo el marcador, migra 001–019 y crea transaccionalmente dos meses sintéticos con membresías, inscripciones, horarios, cuentas y cobros. Su comparación anual/mensual permanece en snapshot de solo lectura y exige explícitamente datos no vacíos y valores económicos conocidos. La preparación se ejecuta únicamente dentro del test opt-in y a través del driver protegido. No reinicializa un esquema usado. Esto evita tanto la dependencia accidental del recorrido general como una comparación vacía sin cobertura efectiva.

Se eligieron servicios independientes por entrada en vez de resets entre fases: eliminan las interferencias y los esquemas de identidad parciales sin añadir un limpiador destructivo. Se mantienen exactamente las seis suites MySQL antes habilitadas; las pruebas unitarias se ejecutan completas en verify. Las guardas originales y las cuatro bases protegidas no se modificaron.

Verificación local no destructiva: pruebas de regresión comprueban la matriz completa frente a todas las suites habilitadas por RUN_DB_TESTS, ausencia de tolerancia al fallo, un archivo por job sin paralelismo, acreditación previa a su ejecución, baselines explícitos y correspondencia con WORKFLOW. Mocks del fixture anual comprueban rechazo antes de migrar/escribir en esquemas no nuevos y preparación transaccional con datos no vacíos. No se ejecutaron Docker, infraestructura nueva, MySQL ni Actions. La ejecución real de migraciones, fixtures e integraciones en esos servicios sigue pendiente de verificación remota autorizada.

## F. Pruebas

### Evidencia anterior a la corrección de concurrencia

Los resultados siguientes corresponden a la implementación inicial. Su comprobación estática de CI no detectó la concurrencia descrita en E y no certifica el workflow corregido.

| Comando / comprobación                                                                                                                                                           | Resultado final                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm run typecheck                                                                                                                                                                | exit 0                                                                                                                                                                 |
| npm run lint                                                                                                                                                                     | exit 0                                                                                                                                                                 |
| npm run test:unit                                                                                                                                                                | exit 0; 49 archivos aprobados, 15 omitidos; 665 pruebas aprobadas, 255 omitidas, 0 fallidas (920 totales)                                                              |
| npm run build                                                                                                                                                                    | exit 0; frontend Vite y compilación TypeScript de servidor completados; dos advertencias conocidas de anotaciones Zod/Rollup                                           |
| git diff --check                                                                                                                                                                 | exit 0; advertencias LF→CRLF sin errores de whitespace                                                                                                                 |
| YAML de CI, parseo js-yaml y assertions locales                                                                                                                                  | exit 0; estructura y secuencia correctas; sin ejecución del workflow                                                                                                   |
| Simulación de flags heredadas con proceso Node que ejecuta scripts/test-unit.ts y las suites disposable-database, identity-db, binding-b2-db, knowledge-db y event-migrations-db | exit 0; 26 aprobadas, 35 omitidas; 1 archivo aprobado, 4 omitidos; RUN_DB_TESTS, RUN_KNOWLEDGE_DB_TESTS, RUN_EVENT_MIGRATION_QA y autorización heredadas neutralizadas |

La simulación se ejecutó con spawnSync(process.execPath, argumentos --import tsx scripts/test-unit.ts seguidos de esas cinco rutas), estableciendo las tres flags RUN indicadas a true y ALLOW_DESTRUCTIVE_DB_TESTS a destroy-disposable-only en el entorno hijo. Solo la suite de guardas corrió; las suites MySQL quedaron omitidas.

Incidencias de ejecución: npx vitest run tests/disposable-database.test.ts y npm run test:unit fueron bloqueados inicialmente por EPERM al renombrar caché temporal en el sandbox, antes de ejecutar pruebas. Los reintentos autorizados fuera del sandbox pasaron. La primera focalizada tenía 25 casos y la primera general segura 664 aprobados/255 omitidos; tras añadir el rechazo de applyCleanup, la validación final tiene los 26 y 665 indicados arriba. Dos errores de tipado detectados durante implementación fueron corregidos antes de las validaciones finales. No se instalaron ni actualizaron dependencias. Prettier se ejecutó una vez sobre los archivos compatibles afectados.

Los rechazos automatizados cubren las cuatro bases conservadas, autorización ausente o antigua, acreditación incompleta, esquema/servidor efectivo diferente, marcador ausente/incorrecto/múltiple, y la aceptación mediante lecturas de un entorno acreditado. También cubren query/execute/getConnection, destrucción de conexiones rechazadas, nueva comprobación en cada adquisición, setup real de Vitest y entrada manual de limpieza sobre prisma_test sin conexión.

No se ejecutaron suites destructivas, migraciones, restauraciones, pruebas de Google real ni QA visual. Las omisiones de integración no equivalen a pruebas aprobadas.

### Validación de la corrección final

Resultados finales: `npm run typecheck` exit 0; `npm run lint` exit 0; `npm run test:unit` exit 0, 51 archivos aprobados/15 omitidos y 674 pruebas aprobadas/255 omitidas/0 fallidas (929 totales); `npm run build` exit 0, con las dos advertencias conocidas de Zod/Rollup; `git diff --check` exit 0. No se modificaron las 26 guardas anteriores, que permanecen aprobadas.

Focalizada final: `npm run test:unit -- tests/ci-db-isolation.test.ts tests/statistics-annual-fixture.test.ts tests/disposable-database.test.ts`, exit 0, 3 archivos/35 pruebas aprobadas, ninguna omitida o fallida. Incluye 5 regresiones estáticas de CI/documentación, 4 comprobaciones del fixture anual mediante mocks y las 26 guardas anteriores. Una primera focalizada, anterior a incorporar la comprobación documental, tuvo 34 aprobadas. YAML final parseado con js-yaml y assertions de jobs, matriz de seis suites, servicio/usuario/esquema, acreditación y comando único: exit 0. No se ejecutó el workflow ni se verificó SQL contra MySQL real.

Incidencias de esta corrección: Vitest volvió a encontrar EPERM de caché en el sandbox, sin ejecutar casos; los reintentos autorizados fuera del sandbox pasaron, siempre por test:unit sin autorización destructiva. Lint detectó una expresión regular con espacios literales; se corrigió a cuantificador y se repitieron lint y la focalizada, ambos aprobados. Prettier se ejecutó una vez sobre los ocho archivos afectados por esta corrección. No se instalaron dependencias.

El cambio de esta corrección alcanza .github/workflows/ci.yml, tests/statistics-annual-db.test.ts, tests/statistics-annual-fixture.ts, tests/statistics-annual-fixture.test.ts, tests/ci-db-isolation.test.ts, docs/WORKFLOW.md, docs/PROJECT_STATE.md y este informe. Los demás cambios previos del Paso 3C se conservan. El working tree completo contiene 37 archivos modificados y 10 nuevos, sin stage ni commit.

## G. Estado Git

Rama: codex/iteration-12-identity-foundations.

HEAD: 66f70aad9a62694667956b7d21f2e1d65af7042f, igual al inicial. Working tree inicialmente limpio; todos los cambios de este paso quedan sin stage ni commit. No hubo push, pull, fetch, merge, rebase, despliegue ni cambios de configuración Git. PRISMA MCP no fue modificado.

Archivos modificados (37):

- .github/workflows/ci.yml
- AGENTS.md
- README.md
- docs/MODELO-PERIODOS.md
- docs/PROJECT_STATE.md
- docs/QA.md
- docs/V1.md
- docs/WORKFLOW.md
- docs/iterations/2026-11-google-oidc-core.md
- docs/iterations/2026-11-identity-binding-operations.md
- docs/iterations/2026-11-identity-foundations.md
- docs/iterations/2026-11-supervised-google-binding.md
- package.json
- scripts/setup-local-db.ts
- server/qa-cleanup.ts
- tests/ai-knowledge-db.test.ts
- tests/binding-b2-db.test.ts
- tests/clone-period-cases.ts
- tests/configuration-deletion-cases.ts
- tests/event-migrations-db.test.ts
- tests/expenses-cases.ts
- tests/facilitator-cases.ts
- tests/identity-bindings-db.test.ts
- tests/identity-db.test.ts
- tests/integration.test.ts
- tests/knowledge-db.test.ts
- tests/knowledge-proposals-db.test.ts
- tests/membership-cases.ts
- tests/model-fixtures.ts
- tests/oidc-db.test.ts
- tests/payment-cases.ts
- tests/recurring-amount-removal-db.test.ts
- tests/recurring-expenses-db.test.ts
- tests/recurring-periods-db.test.ts
- tests/special-events-db.test.ts
- tests/statistics-annual-db.test.ts
- tests/statistics-db.test.ts

Archivos nuevos (10):

- docs/iterations/2026-11-db-test-safety.md
- scripts/test-unit.ts
- server/disposable-database.ts
- tests/db-safety-setup.ts
- tests/disposable-database.test.ts
- tests/guarded-mysql.ts
- tests/ci-db-isolation.test.ts
- tests/statistics-annual-fixture.ts
- tests/statistics-annual-fixture.test.ts
- vitest.config.ts

## H. Pendientes

- Revisión del propietario sobre este working tree.
- En una intervención posterior autorizada, ejecutar el workflow en su servicio MySQL efímero y confirmar las integraciones reales. No usar las cuatro bases conservadas para resolver esa verificación.

Esta intervención se detiene aquí; no avanza a body-parser, B3 ni B4.
