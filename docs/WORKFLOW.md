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
npm test
npm run build
git diff --check
```

Luego:

```powershell
git diff
git status
```

## 6. Tests DB

Únicamente contra `prisma_test`:

```powershell
$env:RUN_DB_TESTS='true'
$env:DB_NAME='prisma_test'
npm test
Remove-Item Env:RUN_DB_TESTS
Remove-Item Env:DB_NAME
```

Nunca contra `prisma_dev`, `prisma_demo` o producción.

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

Si Vite utiliza otro puerto porque `5173` está ocupado, usar `localhost` con el puerto informado por Vite.

## 8. Cambios de DB

Para toda iteración que requiera esquema:

1. diseñar primero;
2. usar una migración nueva;
3. probar sobre `prisma_test`;
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
6. **Recuperación:** si el nuevo Worker está publicado y falla críticamente, evaluar redesplegar la versión anterior *verificada* del mismo Site, con autorización. Esto usa el entorno vigente; no revierte migraciones ni datos CRM. Registrar si la recuperación fue solamente identificada o efectivamente ensayada.
7. **Cierre:** completar matriz de estados y límites, actualizar `PROJECT_STATE.md` y documento de iteración, y ajustar `ROADMAP.md` si corresponde. El cierre documental en `main` requiere revisión/acción expresa del propietario porque el push de CRM a `main` desencadena SiteGround, incluso para cambios solo Markdown.

Referencia de 10.2: Site privado versión 6, despliegue `appgdep_6aee34f0885881919d6aa1374d1694d9`, quinta herramienta visible después de «Actualizar herramientas»; consulta `2026-11` exitosa sin eventos.

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

