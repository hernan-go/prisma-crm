# Iteración 10.2 — Eventos Especiales, Etapa 1

> Antecedente de implementación. Las reglas funcionales vigentes y validaciones finales están en [reestructuración definitiva](2026-11-special-events-stage-3.md); cupos, reintegros visibles, cinco tarjetas y consolidación anterior quedaron superados.

Alcance autorizado: modelo, contratos, backend, Personas sin teléfono y pruebas aisladas. Base CRM `244f80c423ae99e51db069092e4828961fcd38e3`; rama `codex/iteration-10-2-events-stage-1`. Sin commits, push, integración a main ni despliegues. Etapas 2–4 pendientes de autorización.

## Persistencia y operaciones

014 agrega únicamente `special_events`, `event_participants` y `event_money_movements`. Sin backfill, seeds ni cambios a Gastos. FK restrictivas, importes DECIMAL(12,2), CHECK y UUID único para cada alta de evento y movimiento. Runner exige 013 y rechaza tablas parciales sin registro; DDL MySQL no tiene rollback transaccional. Si falla, mantener escritores detenidos e inspeccionar objetos/constraints antes de completar o recuperar; no borrar tablas con datos como procedimiento automático.

El router `/api/special-events` queda bajo la sesión, Origin y límites existentes. GET lista por `period_id`; `include_cancelled=true` habilita historial explícito. GET `/:id` ofrece detalle e historial incluso cancelado/cerrado. POST crea; PATCH `/:id` edita campos del mismo período; POST `/:id/status` cambia draft/confirmed/held/cancelled; POST `/:id/reschedule` recibe período, fecha, horas y motivo. Cancelled es terminal operativamente, pero admite reintegros y anulación de movimientos erróneos. No existe DELETE financiero ni borrado administrativo de eventos.

POST `/:id/participants` incorpora Persona activa sin membresía/cuenta de taller; PATCH `/:id/participants/:participantId` modifica precio/notas/activo. Un registro por Persona/evento, reincorporación explícita sobre el mismo ID. Precio cero es cortesía; cambios del precio general no modifican precios individuales. Cupo nullable; transacción rechaza altas/reincorporaciones o reducción de capacidad que lo excedan.

POST `/:id/participants/:participantId/movements`: `kind=collection|refund`, fecha efectiva, importe positivo, receptor jesica/hernan, medio cash/transfer, notas. Reintegro limitado al cobro válido neto individual. POST `/:id/movements/:movementId/void` requiere motivo y conserva original; anular cobros no puede dejar reintegros superiores al respaldo válido. Corrección: anular explícitamente y cargar el reemplazo, conservando ambos y sus recibos. No se inventan salidas al retirar/cancelar.

Todas las mutaciones posteriores al alta requieren `request_id` UUID y `expected_revision` del evento. `peopleTransaction` serializa con escritores actuales, evento/período bloqueados y revision optimista. Historial JSON en el evento conserva cambios relevantes y recibos por solicitud, sin cuarta tabla. Clave de comando acotada al evento; movimiento además único globalmente. El mismo payload validado devuelve `{id,revision}` original antes de validar cierre/revisión actual; otra acción/payload con la misma clave devuelve 409. El cliente debe conservar clave y payload ante timeout; nunca generar otra clave para reintentar un cobro. No se poda historial ni recibos. Identidad registrada: administración compartida, no receptor financiero.

Reprogramar cambia solo evento/período/horario, con ambos períodos abiertos; participantes y movimientos mantienen IDs y fechas reales. Periodo de cancelado permanece en su última programación para conciliación técnica. Períodos con eventos/antecedentes bloquean cambio de año/mes y eliminación; las guardas conservan compatibilidad anterior a 014. Nuevas rutas responden 503 sin 014, sin afectar módulos previos.

## Preparación para siguientes etapas

`calculateEventTotals` separa recaudado/pending de activos y neto efectivo de todos los participantes; importes exactos como strings, exceso individual separado. `readEventFinancialRows` entrega movimientos válidos del período, incluyendo retirados/cancelados. Aún no cambia Carteras, Dashboard, Estadísticas, MCP ni agrega indicadores visuales; no usar esta entrega aislada como versión funcional productiva de Eventos.

Etapa 2 debe agregar menú izquierdo independiente y UI, con cinco tarjetas. Etapa 3 debe asociar Gastos adicionales, excepción acotada de fecha, protección de cascadas y traslado transaccional de esos mismos gastos al reprogramar; debe integrarse en el mismo núcleo transaccional, no después del commit. Hasta esa etapa no hay asociaciones de gastos que puedan quedar fuera del traslado. No sumar nuevamente el subconjunto de gastos del evento al total de Gastos Período. Cálculos de Cartera incluirán todos los cobros/reintegros reales, aunque los indicadores comerciales excluyan retirados. El neto visual futuro resta gastos directos, con aclaración de resultado estimado y no caja.

Personas permite teléfono vacío/omitido, valida los informados y no considera vacíos coincidencias. Importaciones normales, Forms y reconocimiento de recibos legacy conservan esquema con teléfono obligatorio. Única adaptación visual: quitar asterisco obligatorio del teléfono en el formulario existente.

## Validación local

Suite específica: `RUN_EVENT_DB_TESTS=true`, `DB_NAME=prisma_test`, host local y comprobación `SELECT DATABASE()` antes de migrar/escribir. No ejecutar simultáneamente con suites que reinician esquema. Aplica/repite 014, valida rechazo de registro parcial, crea períodos y Personas sintéticos explícitos y retira solo sus filas; conserva la migración aplicada. Hashes de tablas originales antes/después comprueban preservación. No usa reset, seed ni limpieza general. `npm test` sin flags no activa esta integración.

Verificación final local del 02/11/2026: typecheck y lint aprobados; suite normal 485 aprobadas y 200 integraciones omitidas por flags desactivados; integración específica 16/16 aprobadas exclusivamente en prisma_test; build completo aprobado y git diff --check sin errores. Advertencias conocidas no bloqueantes de anotaciones Zod/Rollup. Vitest inicialmente bloqueado por EPERM del sandbox antes de ejecutar casos; reintento autorizado fuera del sandbox satisfactorio. Build ejecutado dentro del sandbox.

014 aplicada y registrada solo en prisma_test, con baseline 001–013 comprobado antes de ejecutar el runner. Replay registrado y rechazo de aplicación parcial verificados; tres tablas nuevas sin fixtures remanentes de la suite. Hashes de las ocho tablas originales controladas idénticos antes/después: people, periods, period_memberships, enrollments, monthly_accounts, payments, period_expense_categories y period_expenses. No se ejecutaron suites que reinician esquema; su fixture compartida solo recibió el orden de FK de las tres tablas para futuras regresiones autorizadas. Pruebas incluyen claves/revisiones, cuatro combinaciones receptor/medio por HTTP, carreras de cupo/reintegro, rollback, parciales, bajas/reemplazos, cancelación, anulaciones dependientes, traslado entre meses, bloqueos de períodos y preservación de requisitos de importación.

Etapa 1 completada localmente, pendiente de revisión. Sin operación en prisma_dev, prisma_demo, producción ni repositorio MCP; sin commits, push ni deploy. No habilitar Eventos en producción con esta entrega parcial: falta la UI y la consolidación financiera de etapas posteriores.
