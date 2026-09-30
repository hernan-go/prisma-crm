# Pago a facilitadores

La unidad es oferta del período + facilitador. Los horarios del período aportan
las combinaciones, sin consultar `activities.instructor_id` y sin filtrar horarios
deshabilitados ni facilitadores inactivos: sus asignaciones pueden ser históricas.
Varios horarios de la misma actividad generan una sola cuenta.

La migración `006.sql` agrega `facilitator_accounts` y `facilitator_payments`.
No modifica las migraciones anteriores ni los movimientos de alumnos.
Las cuentas se guardan al editar importe o concepto. La lista incluye también
cuentas persistidas que ya no tienen asignaciones; la pantalla las identifica.
Los nombres de las ofertas proceden del período; los nombres de facilitadores
usan las asignaciones históricas cuando existen y el registro del facilitador
como respaldo. Las claves foráneas impiden eliminar sus referencias financieras.

`amount_due` distingue NULL de cero. Pagado suma movimientos; pendiente es
`max(amount_due - paid, 0)` o NULL. Los totales del facilitador no presentan
como completo un importe todavía indefinido.

Todas las escrituras usan la transacción existente, `openPeriod` y bloqueo de
cuenta. Crear/editar un movimiento exige importe definido y total resultante
menor o igual al pactado; la edición excluye el propio pago. Cambiar el importe
de la cuenta puede dejar pagos superiores, sin crédito ni ajuste. Una posterior
edición de movimiento vuelve a exigir el límite vigente. Eliminar un pago sigue
permitido en períodos abiertos. La fecha no necesita pertenecer al mes económico.

Endpoints protegidos bajo `/api`:

- `GET /facilitator-accounts?period_id=ID`
- `PUT /facilitator-accounts` (offering_id, instructor_id, amount_due, notes)
- `GET /facilitator-accounts/:id/payments`
- `POST /facilitator-accounts/:id/payments` (date, amount, notes)
- `PUT /facilitator-accounts/:id/payments/:paymentId`
- `DELETE /facilitator-accounts/:id/payments/:paymentId`

Antes de ejecutar esta versión contra cualquier base operativa debe aplicarse
006 con el runner habitual. La validación local usa `prisma_dev`; la integración
recrea exclusivamente `prisma_test` y recorre también las migraciones.
El despliegue y las migraciones productivas requieren autorización explícita.
