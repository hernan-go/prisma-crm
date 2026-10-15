# Corrección — Quitar membresía con cuenta mensual estrictamente vacía

> Cierre posterior confirmado por el propietario el 2026-10-15: implementación integrada, desplegada y aprobada en producción. Este cierre supera los pendientes de Git/deploy del registro histórico siguiente. La eliminación satisfactoria del período noviembre de 2026 también fue confirmada.

**Fecha:** 2026-10-08. **Rama:** `fix/remove-empty-monthly-account`. **Base:** `19eae35`.
**Estado:** implementada y validada localmente. Pendiente de revisión manual y autorización de deploy productivo. Sin add, commit, push, merge ni cambio de rama desde Codex.

## Problema y evidencia

Una incorporación errónea podía generar una cuenta mensual automáticamente al asignar actividades o registrar pagos. Cancelar la última inscripción y eliminar el último pago conserva esa cuenta. La baja de membresía bloqueaba por cualquier cuenta existente, incluso con importe NULL y sin movimientos. Era consistente con D014 anterior, pero dejaba incompleto el flujo de corrección.

Diagnóstico previo reproducido exclusivamente en `prisma_test`: Noviembre 2090, persona sintética 48, membresía 46, inscripción 38, cuenta 96 y pago 28 por $1.000. Después de eliminar pago e inscripción quedaron cero inscripciones, cero pagos y cuenta con importe NULL. Quitar y reintentar devolvieron 409. Cambiar importe a cero y luego a NULL tampoco eliminaba la cuenta. Ese fixture pertenecía a la DB descartable; la suite posterior reconstruye `prisma_test`.

Evidencia productiva obtenida por SELECT manual de solo lectura y comunicada por el usuario para Noviembre 2026:

| Persona               | Cuenta | Inscripciones | Importe | Pagos | Total pagado |
| --------------------- | ------ | ------------- | ------- | ----- | ------------ |
| Lorena Beatriz Aimola | 147    | 0             | NULL    | 0     | 0.00         |
| Graciela Cornejo      | 148    | 0             | NULL    | 0     | 0.00         |
| María Julieta Brebbia | 149    | 0             | 0.00    | 0     | 0.00         |

Codex no conectó ni consultó producción. Los tres casos no fueron modificados y quedan como referencias para smoke manual posterior.

## Nueva regla y algoritmo

NULL significa importe todavía no definido. Cero representa una decisión explícita de no cobrar ese mes: no es vacío. La regla usa el estado actual; no afirma que la cuenta nunca haya tenido movimientos eliminados previamente.

`membershipRemove` mantiene `peopleTransaction` y su bloqueo compartido entre procesos:

1. Bloquear/validar período abierto.
2. Buscar y bloquear membresía por ID y período; ausencia devuelve 404.
3. Contar inscripciones de esa persona/período; si existen, responder 409 sin eliminar datos.
4. Buscar cuenta del mismo par con `FOR UPDATE`.
5. Si existe cuenta, buscar pagos vinculados con lectura bloqueante. Cualquier pago o importe distinto de NULL, incluido cero, devuelve 409 sin eliminar datos.
6. Si existe cuenta estrictamente vacía, eliminarla por ID.
7. Eliminar membresía por ID y período. Confirmar ambas eliminaciones juntas; cualquier fallo revierte ambas.

Sin cuenta ni inscripciones se elimina solamente la membresía. No se elimina la persona global ni se modifican otros períodos. Se conservan FK y no se agregan cascadas. SQL parametrizado.

Inscripciones, pagos y edición de importe usan el mismo `peopleTransaction`: las escrituras concurrentes se serializan. Si la baja gana, la escritura posterior rechaza la falta de membresía. Si la escritura gana, la baja detecta inscripción/pago/importe definido y bloquea. No se introduce otro sistema de locking.

El modal conserva sus controles y explica la eliminación automática de cuenta vacía y los bloqueos. El 409 menciona inscripciones, pagos e importe definido que deben conservarse.

## Implementación y alcance

- `server/memberships.ts`: excepción transaccional para cuenta estrictamente vacía y mensaje 409.
- `client/Management.tsx`: texto del modal, sin estilos ni pasos nuevos.
- `tests/membership-cases.ts`: adaptación y cobertura adicional.
- D014, arquitectura y estado actual: nueva regla y situación local pendiente de deploy.

No requiere migración. No existe `010.sql`; no se modifican `001.sql`–`009.sql`, esquema, FK, dependencias, creación automática de cuentas, `enrollmentInDB`, `paymentInDB`, importaciones, Cobros ni Dashboard. Documentación histórica de iteraciones anteriores preservada.

## Tests y validación

Cobertura en `tests/membership-cases.ts`:

- Membresía pura: baja 200 conservando persona global.
- Cuenta NULL creada por inscripción: bloqueo mientras existe inscripción, snapshot intacto; tras cancelarla, cero inscripciones/pagos y baja 200 eliminando cuenta y membresía.
- Cero y positivo definidos, sin pagos ni inscripciones: 409 con snapshots financieros intactos.
- Pago con importe NULL: 409 sin pérdida de datos; eliminar el último pago permite baja de cuenta y membresía.
- Fallo sintético después de borrar la cuenta y antes de borrar membresía: verifica dentro de la transacción que la cuenta ya no existe, luego respuesta 500 y restauración exacta de cuenta/membresía; reintento exitoso sin residuos del caso.
- Aislamiento: otra membresía/cuenta/inscripción/slots/pago de la misma persona permanece intacta.
- Carrera existente quitar/asignar y nuevas carreras partiendo de cuenta vacía contra inscripción, pago y definición de cero: solamente baja exitosa + escritura rechazada, o escritura exitosa + baja bloqueada; validación de todas las relaciones finales.
- Cobertura anterior de cierre, archivados, cruces de ID/período y FK preservada.

Prettier ejecutado una vez sobre cada archivo compatible modificado. Orden de validación: typecheck, lint, tests normales con integración desactivada, build y diff check; luego preflight y suite completa DB. `SELECT DATABASE()` devolvió exactamente `prisma_test` antes de ejecutar pruebas de integración. Host forzado a `127.0.0.1:3306`, `DB_NAME=prisma_test`, `RUN_DB_TESTS=true`; variables retiradas al finalizar.

Resultados: typecheck OK; lint OK; normales 116 aprobados y 122 integraciones omitidas; suite completa 238 aprobados en 9 archivos, ninguno omitido (122 integraciones); build OK; diff check OK. Vitest/Vite requirieron reintento fuera del sandbox tras EPERM. Warnings conocidos no bloqueantes de anotaciones Zod/Rollup.

## Pendientes humanos

Revisión manual del modal y autorización de Git/deploy a cargo del usuario. Después del deploy, smoke manual: Lorena y Graciela deben poder quitarse si conservan las condiciones informadas; María Julieta debe seguir bloqueada mientras su importe sea cero definido. Codex no modifica esos registros, `prisma_dev`, producción ni SiteGround. Ningún despliegue fue realizado.
