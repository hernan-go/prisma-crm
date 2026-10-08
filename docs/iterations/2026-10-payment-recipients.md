# Cobros Período — receptor y medio independientes

**Fecha:** 2026-10-07. **Base:** `a599378`. **Estado:** implementación y validación local aprobadas; sin add, commit, push, merge ni deploy. `009.sql` aplicada en `prisma_test` y `prisma_dev`; pendiente en producción, que continúa con `008.sql`. Pruebas destructivas y de recuperación exclusivamente en `prisma_test`.

## Alcance aprobado

Receptor significa quién quedó a cargo del dinero PRISMA. Valores: `jesica` / `hernan`, labels Jésica / Hernán. Medios exclusivamente `cash` / `transfer`, labels Efectivo / Transferencia. Las cuatro combinaciones son válidas. Ambos selectores comienzan vacíos en altas; editar conserva los valores persistidos y cambiar uno no modifica el otro.

No se modifica monthly_accounts, importe a cobrar, deuda, saldo a favor, sobrepagos, membresías ni cierre de períodos. No se cambia la regla de fecha de pagos. No se agrega legacy_method ni estado Sin asignar. Cartera Independiente y separación especial de Informática fueron evaluadas y descartadas: modelo financiero único PRISMA, sin exclusiones por actividad.

## Modelo y migración 009

`payments.recipient VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL`, sin default, con `chk_payment_recipient` limitado a jesica/hernan. Dinero continúa en DECIMAL(12,2). `001.sql`–`008.sql` son inmutables.

Pasos reintentables, ejecutados en una misma conexión:

1. Guardas SQL verifican `008.sql`, membresías, medios existentes y estructura de recipient si ya existe.
2. Agregar recipient nullable únicamente si falta.
3. Rechazar receptores existentes inválidos o una restricción nombrada con definición inesperada.
4. Completar exclusivamente nulos: cash → jesica, transfer → hernan. `updated_at=updated_at` evita cambiar el timestamp automático.
5. Verificar cero nulos/valores inválidos; agregar CHECK si falta y terminar en NOT NULL.
6. Verificar estado final. El runner registra 009 únicamente después de todas las sentencias.

Las guardas usan una tabla temporal con CHECK para abortar ante resultados inválidos; un SELECT informativo no alcanza. Las columnas/constraints existentes se inspeccionan en information_schema. No se sobrescriben receptores previamente persistidos, incluidas combinaciones nuevas cruzadas.

MySQL confirma DDL implícitamente: no hay rollback garantizado de esquema. Se prueban interrupciones antes del backfill, antes de NOT NULL y antes del registro final, recuperación y reejecución completa/registrada. Una estructura o dato parcial inesperado se rechaza sin corregirlo automáticamente.

## Backend, UI y Dashboard

POST/PUT de payments validan y guardan receptor y medio independientes. GET de pagos/ficha incluye recipient. Formularios compartidos, movimientos e historial muestran ambos conceptos; desaparece wallet(method).

La card existente Carteras del mes muestra Jésica y Hernán con Efectivo, Transferencia y Total. El total cobrado, los totales por medio y los seis agregados de carteras se obtienen en la misma consulta SQL; suma de carteras = total cobrado. No se rediseña el resto del Dashboard.

## Forms e idempotencia

Preview mantiene importes y pago inicial manuales, sin leer finanzas del CSV. Pago incluido exige receptor, medio, monto y fecha válidos. La clave conservadora de duplicados sigue siendo persona/período/fecha/monto/medio: cambiar receptor no evita la detección.

El receipt se consulta dentro del bloqueo/transacción antes de validar el contrato de escritura nuevo. Para un receipt existente se acepta exclusivamente su hash actual o el hash pre-009 reconstruido. La canonicalización legacy mantiene orden, defaults y exclusión de filas skip, y nunca descarta un recipient explícito para forzar coincidencia. Solo reconoce operaciones ya completadas; no habilita nuevas escrituras. No se modifican hashes/receipts existentes. Un nuevo request_id exige siempre el contrato actual.

## Validación

Cobertura específica de las cuatro combinaciones, receptor faltante/inválido, edición independiente, saldos y sobrepagos, cierre, membresías, Dashboard y reconciliación, Forms/duplicados/rollback/receipts. Hash pre-009 con valor esperado fijo independiente del helper.

Fixture de migración: cuatro pagos sintéticos por $50.069,12, incluyendo período cerrado y persona archivada. Comparación exacta de IDs, account_id, fecha, monto, medio, notas, created_at y updated_at; cuentas y entidades relacionadas intactas. Cero históricos sin receptor. Verificación de NOT NULL, CHECK, ausencia de default, estados parciales inválidos y recuperación.

Validaciones completadas y aprobadas: Prettier una sola vez sobre archivos tocados compatibles; typecheck y lint OK; tests normales con 116 aprobados y 114 de integración omitidos; suite completa `prisma_test` con 230 aprobados, cero fallidos y cero omitidos; build OK (warnings no bloqueantes conocidos de Zod/Rollup); git diff --check OK. Revisión de interfaz local realizada con servidor aislado sobre `prisma_test`: ambos selectores inicialmente vacíos, elegir Hernán conserva medio vacío y elegir Efectivo conserva Hernán. Movimientos muestran receptor/medio. Carteras visibles: Jésica $33,25 + Hernán $10,25 = cobrado $43,50. Servidor temporal cerrado al terminar.

### Aplicación controlada y revisión manual en prisma_dev

Preflight de solo lectura autorizado: host `127.0.0.1:3306`, base efectiva `prisma_dev`, cero pagos, sin columna recipient ni registro de 009. Después de una nueva autorización se ejecutó únicamente `009.sql`, sin migraciones anteriores, seeds ni datos automáticos. Verificación posterior: `VARCHAR(6) ascii_bin NOT NULL`, sin default, CHECK activo limitado a jesica/hernan, registro único de 009 y cero pagos antes/después. Datos y esquema de las otras 20 tablas sin cambios; `schema_migrations` solo incorporó 009 y conservó sus registros anteriores.

El usuario aprobó la revisión manual local sobre `prisma_dev`. Validó las cuatro combinaciones, la independencia de los selectores, movimientos con receptor y medio, y la cuenta mensual conservando A cobrar / Pagado / Debe. No detectó regresiones funcionales visibles.

| Receptor      | Efectivo | Transferencia |   Total |
| ------------- | -------: | ------------: | ------: |
| Jésica        |  $15.000 |       $20.000 | $35.000 |
| Hernán        |   $5.000 |       $20.000 | $25.000 |
| Total cobrado |  $20.000 |       $40.000 | $60.000 |

Reconciliación aprobada: Total Jésica + Total Hernán = $35.000 + $25.000 = Total cobrado $60.000.

## Próximos pasos autorizables por separado

`009.sql` todavía NO está aplicada en producción; producción continúa con `008.sql`. Antes del deploy productivo es obligatorio realizar backup, preflight de solo lectura y luego migración productiva controlada: pausar escrituras, aplicar/verificar `009.sql`, registrar y recién entonces desplegar código compatible con autorización explícita. El backend anterior no puede crear pagos válidos tras NOT NULL; recuperar implica conservar pausa y completar esquema/código compatible.

Producción/SiteGround se operan manualmente fuera de Codex. Sin autorización de integración/deploy. La iteración anterior de membresías ya está desplegada en a599378, con 008 aplicada en producción y smoke test aprobado según confirmación del usuario.
