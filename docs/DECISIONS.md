# PRISMA CRM — Decisiones de producto y arquitectura

Este documento registra decisiones que no deben rediscutirse en cada iteración salvo que exista un motivo explícito para cambiarlas.

## D001 — Git y producción

`main` es productiva y su push dispara deploy en SiteGround. El push a `main` requiere autorización explícita después de validar localmente.

## D002 — Migraciones aplicadas son inmutables

No editar ni re-ejecutar migraciones ya aplicadas sobre instalaciones existentes. Actualmente `001.sql` a `007.sql` están aplicadas. Próxima migración: `008.sql`.

## D003 — Dinero

Usar `DECIMAL(12,2)`. Nunca `FLOAT`.

## D004 — Períodos explícitos

Un período solo existe si fue creado explícitamente mediante la funcionalidad de períodos. Ningún gasto, fecha, importación o migración puede crearlo automáticamente.

## D005 — Fecha de gasto

La fecha de un gasto debe pertenecer exactamente al período seleccionado. Esto se valida en frontend y backend.

## D006 — Gastos sin categorías por defecto

`Publicidad`, `Insumos`, `Otros`, etc. no se crean automáticamente. Cada período empieza sin categorías y el usuario crea solo las que necesita.

## D007 — Gastos y cierre de período

Un período cerrado es de solo lectura. Crear, editar o eliminar categorías/gastos requiere reabrir explícitamente el período.

## D008 — Publicidad histórica

`advertising_investments` se conserva como respaldo. El modelo operativo actual es `period_expense_categories` + `period_expenses`.

La migración histórica solo opera sobre períodos existentes. Si encuentra un histórico sin período, debe detenerse e informar; nunca inventar el período.

## D009 — Actividades históricas

`activities.instructor_id` es legado y no es fuente de verdad histórica. La asignación real de facilitadores se resuelve mediante horarios/ofertas del período.

## D010 — Clonación de períodos

La clonación futura copia configuración operativa, no movimientos ni personas.

Copiar:

- ofertas/actividades del período;
- nombre de oferta;
- modalidad;
- días;
- horarios;
- facilitadores asignados;
- configuración necesaria para iniciar el nuevo período.

No copiar:

- personas;
- inscripciones;
- cuentas mensuales;
- cobros;
- pagos;
- deudas/saldos;
- cuentas/pagos de facilitadores;
- gastos;
- ningún movimiento financiero.

## D011 — Receptor y medio de cobro son conceptos distintos

Diseño futuro:

- Receptor: Hernán / Jesica.
- Medio: Efectivo / Transferencia.

No inferir receptor a partir del medio.

## D012 — Informática separada de PRISMA

Las clases particulares de Informática son ingresos exclusivos de Hernán y deben registrarse/reportarse separadas de los ingresos PRISMA.

## D013 — Estadísticas

La ruta y pantalla existen, pero su contenido funcional todavía no fue definido. No agregar métricas arbitrarias sin una iteración de diseño explícita.
