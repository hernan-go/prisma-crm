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

## 2. Reglas críticas

- `main` es la rama productiva y su push dispara deploy en SiteGround.
- Los pushes son manuales del propietario después de su revisión y aprobación. Codex no hace push ni merge a `main`.
- Nunca hacer `force push`, rebase destructivo, reset destructivo ni cambios de configuración Git.
- En iteraciones aprobadas, Codex administra autónomamente archivos, ramas Git locales, validaciones y commits dentro del alcance autorizado.
- Producción y SiteGround no se modifican desde Codex. Los cambios productivos de DB son manuales y guiados.
- Nunca mostrar ni registrar secretos reales.

## 3. Bases de datos locales

- `prisma_dev` → desarrollo normal.
- `prisma_test` → única DB permitida para tests de integración/destructivos.
- `prisma_demo` → capturas, demo y datos ficticios.

Nunca ejecutar tests destructivos contra `prisma_dev`, `prisma_demo` o producción.

## 4. Migraciones

- Migraciones productivas registradas: `001.sql` a `016.sql`, según los cierres documentados de 10.1 y 10.2 y las verificaciones del propietario. Codex no realizó una nueva comprobación productiva independiente. Estado y límites: `docs/PROJECT_STATE.md`.
- Las migraciones aplicadas son inmutables.
- `009.sql` implementa receptor independiente de medio; `010–011` implementan Gastos Recurrentes e independencia mensual. Aplicadas en `prisma_test`, `prisma_dev` y producción. Iteración 8 publicada en `51e247e`, con build y smoke productivos aprobados por el propietario. Pruebas destructivas y de recuperación exclusivamente en `prisma_test`. 012 implementa Know-How y 013 propuestas; ambas publicadas, también aplicadas en prisma_dev según el propietario. prisma_demo pendiente de migración/revalidación de 013. `014–016` implementan Eventos Especiales y están aplicadas/verificadas en producción según el cierre de 10.2. Antes de numerar una migración nueva, consultar `server/migrations/` y el estado vigente; no deducir la próxima numeración de antecedentes históricos.
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
npm test
npm run build
git diff --check
```

Integración DB únicamente contra `prisma_test`:

```powershell
$env:RUN_DB_TESTS='true'
$env:DB_NAME='prisma_test'
npm test
Remove-Item Env:RUN_DB_TESTS
Remove-Item Env:DB_NAME
```

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
