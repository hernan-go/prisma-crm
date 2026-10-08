# Corrección — Configuración eliminable vs historial real

**Fecha:** 2026-10-08. **Rama:** `fix/configuration-cleanup-rules`. **Base:** `d6289e6`.
**Estado:** implementada y validada automáticamente. Revisión manual, Git y deploy pendientes del usuario. Sin stage, commits, push, merge, cambio de rama, rebase ni reset.

## Problema y decisión aprobada

Crear una oferta marcaba la actividad global como usada y asignar facilitadores marcaba sus catálogos como usados; el flag impedía eliminar aun sin operaciones. El período consideraba ofertas/categorías vacías «movimientos» y no existía DELETE de oferta/horario.

Configuración no equivale a historia. Se conserva lo que aún tiene relaciones protegidas. Eliminar un período completo tiene una semántica distinta del borrado individual: puede retirar su configuración con flags de uso en 1 si las inscripciones se cancelaron explícitamente y no quedan datos de negocio. No se resetea ningún flag.

## Evidencia de producción aportada por el usuario

Noviembre 2026: 7 ofertas, 19 días, 17 horarios, 17 asignaciones; cero membresías, inscripciones/slots, cuentas/cobros, cuentas/pagos de facilitadores, categorías/gastos y publicidad legacy del mes. Ofertas 19 (Inclusión Digital) y 23 (Informática) con flag 1; horarios 43, 52 y 57 con flag 1, por inscripciones posteriormente eliminadas. Los demás horarios detallados por el usuario conservan cero.

Es diagnóstico comunicado por el usuario, no una consulta productiva de Codex. Noviembre permanece intacto hasta deploy y smoke manual. La prueba crítica reproduce el ciclo de inscripción, cancelación y baja de cuenta vacía/membresía; no simula el caso reseteando flags.

## Algoritmos y límites

`configuration-deletion.ts` centraliza las reglas. Todas las llamadas usan `peopleTransaction`, el bloqueo MySQL compartido entre procesos y lecturas bloqueantes. Sin desactivar FK ni agregar cascadas.

### Período completo

1. Bloquear período y exigir abierto.
2. Rechazar cobros, cuentas mensuales, inscripciones, membresías, pagos/cuentas de facilitadores y gastos; cualquier cuenta de facilitador bloquea incluso con importe NULL.
3. Rechazar slots sobre sus horarios independientemente del período/actividad de la inscripción, y publicidad histórica del mismo mes, sin modificar el respaldo.
4. Bloquear categorías, ofertas y horarios relevantes. El bloqueo compartido serializa nuevas operaciones de aplicación.
5. Eliminar categorías ya verificadas vacías, asignaciones, horarios, días, ofertas y período, en orden de FK. No confiar en CASCADE para borrar gastos.
6. Cualquier fallo revierte todos los borrados. Catálogos globales, personas y otros períodos permanecen.

Flags de ofertas/horarios no bloquean este algoritmo por sí solos. `periodHasConfigurationOrData` se reserva para edición de fecha, que exige período abierto sin configuración/datos. Cerrar/reabrir conserva su operación separada.

### Oferta individual

`DELETE /api/offerings/:id`: bloquear/buscar oferta y período abierto; exigir oferta y horarios con flag cero, sin inscripciones del par período/actividad, cuentas de facilitadores ni slots sobre sus horarios. Retirar asignaciones, horarios, días y oferta, conservando actividad global. Uso histórico devuelve 409 y recomienda deshabilitar.

### Horario individual

`DELETE /api/schedules/:id`: bloquear/buscar horario, exigir período abierto, flag cero y cero slots. Bloquear también asignaciones cuyo par oferta/facilitador tiene cuenta: sus nombres participan en el snapshot financiero. Eliminar asignaciones y horario, conservando oferta y catálogos.

### Catálogos globales y QA

- Actividad: exigir cero inscripciones y cero ofertas, con mensaje para retirarla primero de los períodos; eliminar días sugeridos y catálogo. No elimina silenciosamente ofertas de otros períodos.
- Facilitador: bloquear referencias legacy, pagos/cuentas, horarios usados o slots; exigir abiertos los períodos de sus asignaciones preparatorias. Retirar exclusivamente sus asignaciones nunca usadas y luego el catálogo. No eliminar horarios ni otros facilitadores.
- Flags globales siguen existiendo y activándose por compatibilidad, sin determinar borrabilidad por sí solos. Los de oferta/horario conservan la protección histórica de edición y DELETE individual tras cancelar inscripciones.
- QA llama `deleteCatalogInDB` dentro de su transacción, manteniendo revisión, allowlist y fingerprint. No se ejecuta sobre bases operativas.
- Categorías vacías se eliminan con período. El DELETE individual de categoría conserva su comportamiento existente, incluida su cascada: esta iteración no redefine ese flujo.

## UI

Acciones Eliminar oferta/horario para configuración potencialmente eliminable, errores de backend en el modal existente, confirmaciones que explican qué se retira y qué se conserva. Los botones de catálogo global no se ocultan por los flags legacy; el backend determina las referencias autoritativamente. Se elimina la etiqueta engañosa «Con historial» basada solo en el flag global del facilitador. Período cerrado tiene edición/eliminación deshabilitadas, además del bloqueo backend.

## Tests y validación

`tests/configuration-deletion-cases.ts`, registrado en la suite existente sin reconstrucción concurrente de esquema: 35 casos de integración. Incluye período vacío/clonado, Noviembre con flags 1, conservación exacta de fuente/catálogos/historia ajena, membresías, inscripciones, cuentas y pagos de ambos tipos, categorías vacías/con gastos, cierre/reapertura, DELETE individuales, historial cancelado/persistente, facilitadores preparatorios, cuentas NULL, referencias legacy y slots cruzados, publicidad histórica y QA.

Rollback mediante fallo sintético **después de un DELETE con filas afectadas** en período, oferta, horario y facilitador: comparación completa de 19 tablas y reintento exitoso. Carreras de período/membresía e inscripción, oferta/inscripción, horario/inscripción y facilitador/asignación/cuenta: validación de resultados permitidos, preservación de escrituras válidas y ausencia de huérfanos. La asignación preparatoria puede completarse antes de una eliminación posterior igualmente válida; cuentas e inscripciones exitosas bloquean eliminación de su referencia.

Se adapta el test de categorías vacías conservando el bloqueo de edición de fecha, y se agrega validación de IDs de nuevos DELETE sin acceder a DB.

- Prettier una vez por archivo compatible tocado, al terminar las ediciones correspondientes.
- Typecheck y lint: OK.
- Normales con DB desactivada: 117 aprobados, 157 integraciones omitidas.
- Build: OK, warnings conocidos no bloqueantes de Zod/Rollup.
- `git diff --check`: OK.
- Suite completa: 274 aprobados en 9 archivos, sin omisiones, exclusivamente `prisma_test`; preflight `SELECT DATABASE()` = `prisma_test`, host local `127.0.0.1:3306`. Tests/build requirieron reintento fuera del sandbox por EPERM.

## Revisión manual pendiente

Se prepararon y conservaron estos casos sintéticos exclusivamente en `prisma_test`:

| Período | ID | Caso |
| --- | --- | --- |
| Agosto 2094 | 84 | Fuente de clonación; debe conservarse al borrar septiembre. |
| Septiembre 2094 | 85 | Período clonado, sin operaciones; eliminación completa disponible. |
| Octubre 2094 | 86 | Horario 80 y facilitador 50 preparatorios; otro facilitador 52 debe conservarse. Oferta 69 nunca usada, independiente del horario anterior. |
| Noviembre 2094 | 87 | Oferta 70 / horario 82 / facilitador 53 con inscripción y finanzas: bloqueos históricos. |
| Diciembre 2094 | 88 | Oferta 71 / horario 83 con flags 1 tras cancelación y baja de cuenta vacía/membresía; eliminación individual bloqueada, período completo eliminable. |

Frontend `http://localhost:5173`, backend local `127.0.0.1:3001` con preflight exclusivo `prisma_test`. Ambos servidores quedan levantados; frontend y proxy API verificados por HTTP 200. El frontend requirió ejecución fuera del sandbox para ser accesible. No se confirmaron eliminaciones manuales. Solo se corrigió automáticamente la inscripción/membresía del fixture recién creado de diciembre para preparar ese caso. Los fixtures son descartables y una nueva suite DB los reconstruirá.

## Esquema, riesgos y producción

Sin `010.sql`, migraciones, recálculo/reset masivo, cambios financieros ni dependencias nuevas. `001–009` permanecen inmutables. Los receipts se conservan; no permiten recuperar el período desde el hash. Tampoco existe auditoría completa de movimientos eliminados: las reglas aprobadas usan relaciones persistentes y los flags locales mientras el período existe.

Sin conexión/escritura a producción, SiteGround, `prisma_dev` o `prisma_demo`. Git y deploy quedan al usuario. Smoke productivo pendiente: Noviembre debe eliminarse solo si conserva las condiciones informadas, sin tocar Octubre, personas ni catálogos globales.
