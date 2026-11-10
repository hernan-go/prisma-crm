# PRISMA CRM — Workflow de desarrollo

## Objetivo

Mantener iteraciones pequeñas, reproducibles y seguras, reduciendo contexto innecesario para Codex y evitando deploys accidentales.

## 1. Antes de una iteración

Desde el repo:

```powershell
git status -sb
git log -3 --oneline --decorate
git fetch origin
```

Confirmar:

- working tree limpio;
- HEAD esperado;
- relación correcta con `origin/main`.

Si hay cambios inesperados, detenerse antes de editar.

## 2. Rama de trabajo

Práctica recomendada para nuevas iteraciones:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/<nombre-corto>
```

Trabajar y validar allí.

No asumir que pushear una feature branch es inocuo respecto de CI/deploy hasta verificar la configuración de SiteGround/GitHub. El único hecho garantizado es que `main` es productiva.

## 3. Prompt de Codex

El prompt debe contener solo lo específico de la iteración.

No repetir arquitectura, reglas de Git, DB o migraciones: Codex debe leer `AGENTS.md` y la documentación indicada allí.

Prompt mínimo sugerido:

```text
Leé AGENTS.md y docs/iterations/<iteracion>.md.
Reconstruí el estado con Git antes de editar.
Implementá solo el alcance definido.
Validá según docs/WORKFLOW.md.
No hagas push a main.
```

## 4. Implementación

Orden preferido:

1. inspección;
2. plan breve;
3. implementación;
4. formatting al terminar todas las ediciones;
5. tests focalizados;
6. validaciones completas;
7. revisión de diff;
8. prueba manual local;
9. commit local si está autorizado.

No expandir alcance durante la ejecución.

## 5. Validaciones normales

### Formatting

Después de terminar todas las ediciones de una iteración y antes de las validaciones:

- Ejecutar Prettier una sola vez sobre todos los archivos nuevos/modificados compatibles con Prettier.
- Limitar el formatting a esos archivos; no formatear todo el repositorio.
- No ejecutar Prettier repetidamente después de cada edición individual.
- Después ejecutar la secuencia estándar de typecheck, lint, tests, build y `git diff --check`:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
git diff --check
```

Luego:

```powershell
git diff
git status
```

## 6. Tests DB

Fuente operativa principal desde el 10/11/2026. Los comandos históricos con prisma_test como descartable quedan retirados.

### Bases conservadas y validación sin MySQL

Las cuatro bases locales en 3306 se preservan: `prisma_dev` (desarrollo), `prisma_demo` (demostración), `prisma_test` (incluye las vinculaciones reales de Hernán y Jesica) y `prisma_qa_events_102_20261106` (QA histórica). Ninguna admite suites destructivas, replay de migraciones ni limpieza QA automática. Producción queda excluida. No reinicializar la institución real para probar bootstrap.

Para validaciones normales usar `npm run test:unit`: desactiva todas las flags DB conocidas y la autorización destructiva en un proceso hijo, aunque estuvieran heredadas o en .env. `npm test` conserva los opt-ins explícitos, pero todo acceso real a MySQL en Vitest pasa por la guarda del driver: query/execute del pool, conexiones de transacciones, migraciones, rutas HTTP y teardown. Sin autorización falla antes de abrir una conexión. No usar configuraciones alternativas de Vitest ni desactivar su setup de seguridad.

### Destino temporal autorizado

Crear infraestructura requiere autorización separada; el Paso 3C no la crea. Usar una instancia MySQL temporal independiente, vacía, sin acceso a datos conservados, con usuario limitado al esquema temporal (sin grants globales ni permisos sobre otras bases). La guarda no audita grants: ese aislamiento corresponde a la preparación; CI lo establece mediante el servicio y MYSQL_USER. No copiar identidades reales ni respaldos operativos al destino.

La preparación externa a los tests debe:

1. Crear un esquema `prisma_disposable_<identificador>` (sufijo minúsculo alfanumérico/guion bajo, 1–40 caracteres).
2. Leer `SELECT @@server_uuid` desde la instancia temporal conocida y conservarlo como TEST_DB_SERVER_UUID. No obtenerlo automáticamente de una conexión arbitraria al iniciar los tests.
3. Generar un token aleatorio de 32 bytes, hex minúsculo, nuevo por entorno. Crear en el esquema `prisma_test_disposable_marker (token CHAR(64) NOT NULL, server_uuid CHAR(36) NOT NULL)` e insertar exactamente una fila con token y UUID. No es una migración del CRM; no crear este marcador en bases conservadas.
4. Configurar privadamente DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, TEST_DB_SERVER_UUID, TEST_DB_DISPOSABLE_TOKEN y `ALLOW_DESTRUCTIVE_DB_TESTS=destroy-disposable-only` para el proceso de prueba. No guardar esa autorización en el .env habitual ni heredar esos valores al desarrollo.

La guarda rechaza nombres protegidos (también mayúsculas) y nombres fuera del prefijo descartable; exige autorización y acreditación completas. Cada adquisición comprueba DATABASE(), @@server_uuid y el marcador en esa misma conexión antes de entregarla al código que escribe. No cachea autorizaciones entre adquisiciones. Tabla ausente, permisos insuficientes o falta de coincidencia exacta abortan; nunca crea el marcador ni repara la acreditación. Un error destruye esa conexión. Previene errores operativos; no es una barrera frente a código malicioso con credenciales MySQL privilegiadas.

La ejecución de CI tiene dos fases: primero `verify` ejecuta lint, build y `npm run test:unit` sin MySQL. Solo después de su éxito, `integrations` ejecuta una matriz de seis suites con `max-parallel: 1` y `fail-fast: false`. Cada entrada recibe un **servicio MySQL nuevo**, con su propio esquema, usuario, UUID y marcador. No se comparte el estado de una entrada con otra. GitHub no garantiza el orden entre entradas de la matriz y el procedimiento no depende de él.

| Suite                        | Baseline propio sobre el esquema nuevo acreditado                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| integration.test.ts          | Solo marcador; prepara el recorrido de migraciones desde 001 y sus fixtures históricos                                                                                              |
| identity-db.test.ts          | Su beforeAll prepara 001–016 y luego prueba 017                                                                                                                                     |
| statistics-annual-db.test.ts | Exige solo marcador, aplica 001–019 y crea dos meses sintéticos con membresías, inscripciones, cuentas y cobros; después compara lecturas anual/mensual en snapshot de solo lectura |
| identity-bindings-db.test.ts | Su beforeAll prepara 001–018; exige institución vacía                                                                                                                               |
| oidc-db.test.ts              | Su beforeAll prepara 001–018 y luego prueba 019                                                                                                                                     |
| binding-b2-db.test.ts        | Su beforeAll prepara 001–019; exige institución vacía                                                                                                                               |

Cada entrada invoca exactamente un archivo con `npx vitest run --no-file-parallelism --hookTimeout=30000 "${{ matrix.suite }}"`. El hookTimeout admite la preparación desde cero. Para una ejecución manual autorizada, usar ese comando sustituyendo la expresión de GitHub por una única ruta de la tabla y configurar `RUN_DB_TESTS=true` junto a la acreditación. Cada suite requiere un entorno temporal nuevo e independiente preparado según esta sección; no ejecutar la siguiente sobre el estado dejado por la anterior. No usar `npm test` general con RUN_DB_TESTS habilitado sobre un esquema compartido.

Ejecutar bootstrap en procesos secuenciales, solo con institución vacía sintética. No activar conjuntamente suites que resetean esquema o esperan otra línea base. Las flags RUN_KNOWLEDGE_DB_TESTS, RUN_KNOWLEDGE_PROPOSALS_DB_TESTS, RUN_RECURRING_DB_TESTS, RUN_RECURRING_PERIOD_DB_TESTS, RUN_RECURRING_MIGRATION_REPLAY_TESTS, RUN_RECURRING_REMOVAL_DB_TESTS, RUN_EVENT_DB_TESTS, RUN_EVENT_MIGRATION_QA, RUN_STATISTICS_DB_TESTS, RUN_AI_KNOWLEDGE_DB_TESTS y RUN_AI_READ_DB_TESTS no sustituyen la acreditación. Preparar su baseline según la suite: Eventos de migraciones exige solo el marcador; otras requieren migraciones previas. No reutilizar una base parcialmente modificada entre escenarios incompatibles. Cerrar el terminal temporal al finalizar para no conservar flags ni autorización.

### CI efímero y herramientas manuales

GitHub Actions usa exclusivamente un servicio MySQL 8.4 nuevo por entrada de matriz, esquema prisma_disposable_ci y usuario prisma_ci limitado a ese esquema. El nombre se repite en instancias independientes; no identifica una base compartida entre suites. Un paso docker exec sobre el ID de cada servicio crea el marcador, genera un token nuevo y entrega UUID/token/autorización al job antes de su única suite. CI=true y GITHUB_ACTIONS=true no autorizan nada. Se mantienen las seis suites MySQL antes habilitadas y las pruebas sin DB; las suites optativas mantienen sus flags anteriores. La ejecución real debe comprobarse remotamente después de una publicación autorizada; el análisis local no la acredita.

`qa:cleanup --apply` y `applyCleanup` exigen la misma acreditación, además de plan revisado, confirmación de DB y huellas previas. Generar planes sigue sin borrar. `setup-local-db.ts` está retirado: aborta antes de conectarse y no rota usuarios ni crea bases. `db:migrate` sigue siendo una herramienta manual de migración controlada, no una autorización para tests ni para reinicializar bases; dentro de Vitest está cubierta por la guarda. `db:seed` no escribe datos. No ejecutar SQL de respaldos ni restauraciones como preparación sobre las bases conservadas.

## 7. Desarrollo local

Normal:

```powershell
cd C:\dev\personal\prisma-crm
.\private\run-dev.ps1
```

Demo:

```powershell
.\private\run-demo.ps1
```

URLs de desarrollo local:

- Frontend/UI: `http://localhost:5173`.
- Backend/API: `http://127.0.0.1:3001`.

Para login y validación visual del frontend usar `localhost`.

Evitar `http://127.0.0.1:5173` para el frontend porque puede provocar rechazo por Origin/CORS.

No cambiar puertos silenciosamente si `5173` está ocupado: identificar el proceso y acordar un puerto alternativo si es necesario. En ese caso, usar `localhost` con el puerto explícitamente elegido y verificado.

### Validación visual de frontend con Codex

#### A. Aplicación obligatoria

Aplicar este protocolo en trabajos de frontend, UX/UI, responsive, componentes interactivos y cualquier validación que requiera navegador. Ajustar las comprobaciones al alcance autorizado; una tarea exclusivamente documental no requiere iniciar servicios ni abrir el navegador.

#### B. Identificar el entorno

Determinar dónde se ejecutan el servidor y el navegador: equipo del propietario, sandbox, contenedor o entorno remoto. No asumir que comparten el mismo `localhost`. Distinguir fallas de conexión (servidor inaccesible), configuración del entorno (interfaz, puerto, resolución o aislamiento) y errores reales de la aplicación. Registrar evidencia antes de atribuir una causa.

#### C. Iniciar y verificar el servidor

Antes de abrir el navegador:

1. Verificar si el servicio requerido ya está activo. Comprobar su proceso, dirección, interfaz de escucha y puerto; reutilizarlo si es válido.
2. Si el puerto está ocupado, identificar qué proceso lo utiliza. No finalizar procesos ajenos ni cambiar puertos silenciosamente.
3. Si falta el servicio, iniciar exclusivamente el necesario y mantener el proceso activo durante toda la prueba. Para fixtures aislados basta Vite; no iniciar Express ni MySQL innecesariamente.
4. Verificar mediante HTTP que la URL exacta responde correctamente y corresponde a la página esperada; un `200` del fallback de la SPA no demuestra que exista una ruta QA.
5. Solo después intentar abrir la página en el navegador y comprobar su conectividad desde ese entorno.

Ejemplo de diagnóstico en PowerShell (no inicia ni finaliza procesos):

```powershell
$listeners = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
$listeners | Select-Object LocalAddress, LocalPort, OwningProcess
$listeners | ForEach-Object { Get-Process -Id $_.OwningProcess }
```

Si no hay un servidor válido, ejecutar desde la raíz del repositorio en una terminal que permanezca activa:

```powershell
npx vite --host 127.0.0.1 --port 5173 --strictPort
```

En otra terminal, comprobar la URL que se utilizará en el navegador; para Estadísticas QA:

```powershell
$qaUrl = 'http://localhost:5173/tests/browser/statistics.html'
$response = Invoke-WebRequest -Uri $qaUrl -UseBasicParsing -TimeoutSec 5
$response.StatusCode
$response.Content
```

`localhost` puede resolver a IPv4 (`127.0.0.1`) o IPv6 (`::1`). Ante una falla, contrastar la dirección efectiva con la interfaz de escucha y probar HTTP contra la dirección explícita para diagnosticar. Ese diagnóstico no autoriza cambiar el origen de login: para la aplicación real se mantiene `localhost` por la configuración de Origin/CORS existente. Si las herramientas de diagnóstico no están disponibles, registrar la limitación.

#### D. Elegir el entorno de prueba

**QA visual sintética:** Estadísticas dispone de `http://localhost:5173/tests/browser/statistics.html`, con fixtures sintéticos y solicitudes interceptadas. No requiere MySQL ni backend operativo. Para otros módulos, identificar primero en el repositorio si existe una página QA apropiada; no inventar rutas. No usar datos personales ni información financiera real en fixtures o demostraciones.

**Aplicación real:** cuando se necesite integración real, seguir el inicio normal con `private/run-dev.ps1` indicado arriba, respetando el alcance y las reglas de DB de este workflow. No sustituir una prueba funcional de integración por una prueba sintética; informar qué entorno y datos se utilizaron.

#### E. Elegir el navegador de Codex

Priorizar un navegador accesible desde el entorno donde se ejecuta el servidor y verificar conectividad antes de comenzar la prueba visual. Que la terminal acceda no demuestra que el navegador integrado pueda hacerlo: si solo falla este último, investigar primero una posible separación entre entornos.

No repetir intentos idénticos sin nueva evidencia o un cambio justificado de las condiciones de conexión. No modificar firewall, CORS, políticas de seguridad, credenciales ni configuraciones globales para forzar acceso. Respetar los bloqueos de las herramientas de navegador; no eludirlos.

#### F. Ejecutar la validación visual

Según el alcance de la tarea, comprobar y registrar:

- Escritorio, tablet y móvil, con dimensiones del viewport y distribución responsive; revisar desbordamientos y contenido recortado.
- Navegación, botones, controles y componentes interactivos; cambio de período cuando corresponda.
- Estados de carga, error, vacío y datos parciales, incluida la carga de gráficos cuando existan.
- Consola JavaScript y solicitudes fallidas, si las herramientas permiten inspeccionarlas; indicar si no se pudieron revisar.
- Contraste, navegación por teclado, foco visible, nombres y estados accesibles, y preferencia de movimiento reducido. Una revisión básica no equivale a una auditoría completa ni a una prueba con lector de pantalla.

#### G. Manejar bloqueos y reproducir manualmente

Si el navegador no conecta después de un diagnóstico razonable:

1. Registrar la URL, entorno del servidor/navegador, respuesta HTTP y error observado; separar la causa conocida de las hipótesis.
2. Detener los intentos repetitivos sin nueva información y completar las validaciones automatizadas disponibles dentro del alcance autorizado.
3. Enumerar las verificaciones visuales pendientes y proporcionar instrucciones concretas para reproducirlas manualmente en Chrome o Edge.

La reproducción manual debe indicar el servicio necesario, URL verificada, escenario y acciones con su resultado esperado. Para Estadísticas sintética, por ejemplo: reutilizar Vite válido o iniciarlo según C; abrir la URL QA en Chrome/Edge; usar F12 → barra de dispositivos para escritorio, tablet y móvil (por ejemplo, 1440×900, 768×1024 y 390×844); cambiar el período y probar los controles. Consultar los escenarios existentes en el fixture antes de indicar parámetros; revisar consola y red en DevTools. Para integración real, usar el inicio normal y la ruta real del módulo, sin sustituirla por la página QA.

Nunca declarar una validación visual exitosa si no se ejecutó. Un servidor que responde HTTP o una suite automatizada aprobada no acreditan una inspección visual.

#### H. Informe de cierre

Distinguir expresamente las validaciones automatizadas aprobadas, las pruebas visuales efectivamente realizadas (entorno, tamaños y escenarios), las pendientes por limitaciones del entorno y los problemas reales detectados en la aplicación. No presentar una hipótesis de conectividad como un defecto confirmado del producto.

## 8. Cambios de DB

Para toda iteración que requiera esquema:

1. diseñar primero;
2. usar una migración nueva;
3. probar sobre un destino descartable acreditado según la sección 6;
4. revisar reintentos/idempotencia cuando aplique;
5. prueba local sobre `prisma_dev` solo como migración controlada, nunca como suite destructiva;
6. backup de producción;
7. preflight de producción;
8. aplicar migración productiva manualmente;
9. verificar datos;
10. registrar migración;
11. recién entonces desplegar código si el orden es compatible.

Si la migración no es backward-compatible, definir explícitamente el orden seguro antes de tocar producción.

## 9. Git

Codex puede inspeccionar Git siempre.

En iteraciones aprobadas, Codex puede administrar autónomamente Git local, archivos, ramas, validaciones y commits dentro del alcance. No necesita aprobación por archivo, test o commit local. Ante cambios inesperados en el working tree, preservarlos y detenerse para informar. Los pushes y la integración a main quedan manuales del propietario, después de revisión y aprobación.

Nunca hacer por defecto:

- `git push origin main`;
- force push;
- reset destructivo;
- rebase destructivo;
- cambios de configuración Git.

## 10. Deploy productivo

El propietario realiza manualmente el push definitivo. Antes de push a `main`:

- working tree limpio;
- tests OK;
- prueba manual local OK;
- DB productiva preparada si corresponde;
- backup realizado si hay migración;
- aprobación explícita.

Después de push:

- esperar deploy SiteGround;
- `Ctrl + F5`;
- smoke test productivo;
- verificar datos sensibles de la iteración.

## 11. SiteGround / inodos

Mantener el build estándar de SiteGround.

Política operativa acordada:

- conservar los 2 builds más recientes;
- si hace falta controlar inodos, borrar el tercero más antiguo al generar uno nuevo.

## 12. Cierre de iteración

Actualizar únicamente lo necesario:

- `docs/PROJECT_STATE.md` → estado actual.
- `docs/ROADMAP.md` → mover prioridad.
- `docs/DECISIONS.md` → solo si nació/cambió una regla estable.
- `docs/ARCHITECTURE.md` → solo si cambió arquitectura.
- documento de iteración → marcar completado o archivar.

Evitar handoffs gigantes si estos documentos están al día.

## 13. Publicaciones coordinadas CRM ↔ MCP ↔ ChatGPT (lección 10.2)

Este control aplica cuando una iteración incorpora o modifica herramientas MCP. No confundir los estados: **implementado** (código), **probado** (QA identificada), **desplegado CRM**, **desplegado Worker/Site**, **actualizado catálogo del complemento en ChatGPT** y **validado en consulta real**. Un commit de GitHub y un despliegue `succeeded` por sí solos no acreditan los últimos pasos.

1. **Antes de producción:** registrar commit exacto de CRM y MCP, esquema/migraciones necesarias, resultados de QA disponibles, compatibilidad, backup y vía de recuperación. No repetir pruebas concluidas sin nuevo riesgo técnico. Si existen migraciones, aplicar las reglas de la sección 8 y verificar `schema_migrations` y estructura efectiva; evitar DDL duplicado. Un respaldo anterior a migración no equivale a rollback automático ni a respaldo posterior.
2. **CRM primero si la API lo requiere:** confirmar despliegue SiteGround y lectura sin escrituras imprevistas; distinguir inspección visual de QA productiva de escritura. No usar datos reales para tests destructivos.
3. **Site MCP existente:** en Work/Sites, verificar versión activa, estado y audiencia privada, configuración y versión anterior recuperable. Contrastar las fuentes del repositorio interno del Site con `prisma-site/` del commit GitHub y detenerse ante diferencias no previstas. Los SHA de GitHub y Sites pueden ser distintos. Reutilizar dependencias válidas, respetar lockfile, una compilación por artefacto cuando sea suficiente y publicación privada autorizada. No cambiar secretos, permisos ni otros Sites por conveniencia.
4. **Despliegue:** registrar versión, ID y estado `succeeded`. Verificar que herramientas previas y nuevas estén definidas, sin efectuar escrituras de negocio como smoke test. **Paso explícito adicional: Configuración → Complementos → PRISMA — Análisis de Gestión → Administrar aplicación → Actualizar herramientas.** Si ChatGPT aún ofrece el catálogo anterior, actualizar herramientas y abrir una conversación nueva antes de diagnosticar una falla del Worker; no desplegar otra vez por ese síntoma aislado.
5. **Validación funcional:** utilizar la herramienta MCP nueva y consultas reales de solo lectura. Distinguir respuesta válida con lista vacía/cero de herramienta ausente, `401`, error de transporte o contrato. Para Eventos, ausencia de registros no prueba un fallo ni autoriza inventar eventos.
6. **Recuperación:** si el nuevo Worker está publicado y falla críticamente, evaluar redesplegar la versión anterior _verificada_ del mismo Site, con autorización. Esto usa el entorno vigente; no revierte migraciones ni datos CRM. Registrar si la recuperación fue solamente identificada o efectivamente ensayada.
7. **Cierre:** completar matriz de estados y límites, actualizar `PROJECT_STATE.md` y documento de iteración, y ajustar `ROADMAP.md` si corresponde. El cierre documental en `main` requiere revisión/acción expresa del propietario porque el push de CRM a `main` desencadena SiteGround, incluso para cambios solo Markdown.

Referencia de 10.2: Site privado versión 6, despliegue verificado como `succeeded`, quinta herramienta visible después de «Actualizar herramientas»; consulta `2026-11` exitosa sin eventos.

## 14. Diagnóstico Git: `M` sin diferencias de contenido

Ante un archivo marcado como modificado pero `git diff` vacío, **no ejecutar por defecto** `restore`, `reset`, `checkout`, `add`, `clean`, normalizaciones globales, commits ni cambios de `core.autocrlf`. Primero verificar el archivo específico:

```powershell
$repo = "C:\dev\personal\prisma-crm"
$file = "tests/remaining-skeletons.test.ts"
$full = Join-Path $repo $file
git -C $repo status --short -- $file
git -C $repo ls-files --eol -- $file
git -C $repo ls-files --stage -- $file
git -C $repo ls-files --debug -- $file
git -C $repo diff --exit-code -- $file
git -C $repo diff --cached --exit-code -- $file
git -C $repo hash-object --path="$file" $full
git -C $repo hash-object --no-filters -- $full
(Get-Item -LiteralPath $full).Length
```

Solo cuando **no haya diferencias staged**, el diff de contenido sea `0` y el hash normalizado local coincida con el SHA del índice, valorar refrescar **únicamente esa entrada** del índice (con autorización). En 10.2 funcionó:

```powershell
git -C "C:\dev\personal\prisma-crm" -c core.autocrlf=false update-index -- tests/remaining-skeletons.test.ts
git -C "C:\dev\personal\prisma-crm" status --short
git -C "C:\dev\personal\prisma-crm" diff --cached --exit-code -- tests/remaining-skeletons.test.ts
```

`update-index -- <archivo>` **modifica el índice**, y podría stagear cambios si los hashes no coincidieran: **no es un paso rutinario**. En el incidente confirmado, índice 9548 bytes / archivo 9326 bytes, hash coincidente, `status` limpio tras la operación. La advertencia de conversión LF→CRLF con `core.autocrlf=true` fue una pista, no prueba concluyente de origen; no configurar políticas de EOL a nivel repositorio sin analizar impacto y aprobarlo.
