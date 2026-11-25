# PRISMA CRM — Agent Guide

Este archivo es el punto de entrada para cualquier agente que trabaje sobre PRISMA CRM. Debe mantenerse corto. Los detalles viven en `docs/`.

## 1. Lectura obligatoria antes de editar

Siempre leer, en este orden:

1. `docs/PROJECT_STATE.md`
2. `docs/WORKFLOW.md`
3. El documento de la iteración activa en `docs/iterations/`

Leer además cuando corresponda:

- Cambios de arquitectura o modelo de datos → `docs/ARCHITECTURE.md`
- Cambios de reglas de negocio → `docs/DECISIONS.md`
- Priorización / siguiente trabajo → `docs/ROADMAP.md`
- Migraciones productivas → lectura obligatoria de [PRODUCTION_MIGRATIONS](docs/PRODUCTION_MIGRATIONS.md) antes de preparar o ejecutar cualquier operación.

## 2. Reglas críticas

- `main` es la rama productiva y su push dispara deploy en SiteGround.
- Los pushes son manuales del propietario después de su revisión y aprobación. Codex no hace push ni merge a `main`.
- Nunca hacer `force push`, rebase destructivo, reset destructivo ni cambios de configuración Git.
- Codex ejecuta autónomamente las tareas técnicas aprobadas; los checkpoints son internos. El propietario conserva staging, commits, push, integración y despliegue; cualquier excepción Git exige autorización expresa. Conventional Commits solo en inglés.
- El propietario levanta la aplicación y Codex reutiliza ese entorno. Procedimientos: `docs/WORKFLOW.md`, secciones 7 y 9.
- Producción y SiteGround no se modifican desde Codex. Los cambios productivos de DB son manuales y guiados.
- Nunca mostrar ni registrar secretos reales.

## 3. Bases de datos locales

- `prisma_dev` → desarrollo normal.
- `prisma_test` → base conservada con vinculaciones reales; nunca descartable.
- `prisma_qa_events_102_20261106` → QA conservada; no reinicializar.
- `prisma_demo` → capturas, demo y datos ficticios.

Las cuatro bases locales y producción quedan excluidas de pruebas destructivas. Fuente operativa única: [WORKFLOW, sección 6](docs/WORKFLOW.md#6-tests-db).

## 4. Migraciones

- Antecedente de 10.1/10.2: migraciones productivas `001.sql` a `016.sql`. El estado posterior informado por el propietario y el procedimiento obligatorio están en [PRODUCTION_MIGRATIONS](docs/PRODUCTION_MIGRATIONS.md); no deducir el esquema actual de este corte histórico. Codex no realizó una nueva comprobación productiva independiente.
- Las migraciones aplicadas son inmutables.
- `009.sql` implementa receptor independiente de medio; `010–011` implementan Gastos Recurrentes e independencia mensual. Aplicadas en `prisma_test`, `prisma_dev` y producción. Iteración 8 publicada en `51e247e`, con build y smoke productivos aprobados por el propietario. Los ensayos históricos en `prisma_test` no autorizan nuevas pruebas destructivas; ver WORKFLOW §6. 012 implementa Know-How y 013 propuestas; ambas publicadas, también aplicadas en prisma_dev según el propietario. prisma_demo pendiente de migración/revalidación de 013. `014–016` implementan Eventos Especiales y están aplicadas/verificadas en producción según el cierre de 10.2. Antes de numerar una migración nueva, consultar `server/migrations/` y el estado vigente; no deducir la próxima numeración de antecedentes históricos.
- Dinero: `DECIMAL(12,2)`, nunca `FLOAT`.

## 5. Períodos

- Un período solo puede existir porque fue creado explícitamente por la funcionalidad de períodos.
- Ningún gasto, dato histórico, importación ni migración puede crear un período como efecto secundario.
- Estado `closed` = lectura histórica permitida, escrituras bloqueadas.
- Para corregir un período cerrado debe reabrirse explícitamente.

## 6. Gastos Período

- Modelo: `period_expense_categories` → `period_expenses`.
- No existen categorías por defecto.
- Las categorías pertenecen a un período y se crean bajo demanda.
- La fecha de un gasto debe pertenecer exactamente al período seleccionado.
- La tabla `advertising_investments` se conserva como respaldo histórico; su API antigua está retirada/deprecada.

## 7. Modelo operativo de actividades

Fuente de verdad:

`activities → period_activities → activity_schedules → schedule_instructors → enrollments / enrollment_slots`

`activities.instructor_id` es legado y no debe usarse como fuente histórica.

## 8. Validación estándar

Antes de cualquier validación visual de frontend, Codex debe consultar y aplicar el protocolo «Validación visual de frontend con Codex» de `docs/WORKFLOW.md`, sección 7.

Para cambios normales ejecutar:

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
git diff --check
```

Integración DB: seguir exclusivamente [WORKFLOW, sección 6](docs/WORKFLOW.md#6-tests-db). Para validar sin MySQL usar `npm run test:unit`.

## 9. Alcance

- No hacer refactors generales fuera del objetivo de la iteración.
- No “limpiar” código no relacionado.
- Mantener cambios pequeños, verificables y reversibles.
- Si aparece una contradicción entre código, documentación y producción, detenerse y reportarla antes de editar.

## 10. Fuente de verdad

Orden de prioridad:

1. Producción verificada.
2. `main` actual de GitHub.
3. `docs/PROJECT_STATE.md` y `docs/DECISIONS.md`.
4. Código local limpio.
5. Documentación histórica.
6. Chats antiguos.
