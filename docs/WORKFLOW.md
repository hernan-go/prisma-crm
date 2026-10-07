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
4. tests focalizados;
5. validaciones completas;
6. revisión de diff;
7. prueba manual local;
8. commit local si está autorizado.

No expandir alcance durante la ejecución.

## 5. Validaciones normales

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

URL habitual:

`http://localhost:5173/`

Si `5173` está ocupado, verificar antes de asumir otro puerto.

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

Puede hacer `git add` / `git commit` solo si la iteración lo autoriza.

Nunca hacer por defecto:

- `git push origin main`;
- force push;
- reset destructivo;
- rebase destructivo;
- cambios de configuración Git.

## 10. Deploy productivo

Antes de push a `main`:

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
