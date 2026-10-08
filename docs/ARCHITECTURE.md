# PRISMA CRM — Arquitectura

## Stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- React Hook Form
- Zod
- Lucide React

### Backend

- Express 5
- MySQL 8.4
- `mysql2`
- Decimal.js

## Estructura de dominio

### Actividades y períodos

Fuente de verdad operativa:

```text
activities
  ↓
period_activities
  ↓
activity_schedules
  ↓
schedule_instructors
  ↓
enrollments / enrollment_slots
```

Semántica:

- `activities`: catálogo global.
- `period_activities`: oferta concreta del período.
- `activity_schedules`: horarios de esa oferta.
- `schedule_instructors`: 0..N facilitadores por horario.
- `enrollments`: persona/período/actividad.
- `enrollment_slots`: horarios elegidos.

`activities.instructor_id` es legado.

### Personas y pertenencia al período

`people` es el catálogo global. `period_memberships` representa pertenencia explícita, incluso sin actividades:

```text
people + periods → period_memberships
                      ↓
              enrollments / monthly_accounts
                      ↓
              enrollment_slots / payments
```

`enrollments` y `monthly_accounts` referencian directamente el par `(person_id, period_id)` de membresías mediante FK compuestas restrictivas. La membresía tiene PK propia, `UNIQUE(person_id, period_id)`, fecha de incorporación e índice por período. No genera entidades operativas al crearse.

API: `GET/POST /periods/:periodId/memberships`, `DELETE /periods/:periodId/memberships/:id`. GET admite `person_id` y devuelve personas archivadas históricas. POST recibe exclusivamente `person_id`. DELETE valida el ID dentro del período y bloquea ante cualquier inscripción, pago o importe definido (incluido cero). Una cuenta con importe `NULL`, cero pagos y cero inscripciones se elimina antes de la membresía, dentro de la misma transacción; cualquier fallo revierte ambas eliminaciones. Se conservan el bloqueo existente, las FK restrictivas, la persona global y los datos de otros períodos.

Altas/bajas y operaciones financieras usan la transacción/bloqueo existente `peopleTransaction`, el bloqueo de período abierto y comprobación autoritativa de membresía. Cancelar inscripciones no elimina pertenencia. Bajas de inscripciones/pagos requieren `period_id` explícito; ediciones no trasladan operaciones entre personas/períodos.

`008.sql` crea la tabla y hace backfill exclusivamente desde la unión de pares en inscripciones/cuentas antes de agregar FK. Es reintentable mediante `CREATE TABLE IF NOT EXISTS`, inserción de pares ausentes y consulta a `information_schema` antes de cada FK. No se asume rollback de DDL. Aplicar manualmente la migración completa antes de desplegar código que utiliza membresías.

## Períodos

Estados actuales:

- `open`
- `closed`

Un período cerrado:

- sigue siendo consultable;
- bloquea operaciones de escritura;
- puede reabrirse explícitamente para correcciones históricas.

Los períodos son entidades de negocio explícitas. Nunca deben surgir como efecto secundario de una fecha, gasto, importación o migración.

### Eliminación de configuración

`server/configuration-deletion.ts` centraliza las eliminaciones dentro de la transacción/bloqueo existente `peopleTransaction`, con lecturas `FOR UPDATE` y FK activas. API y limpieza QA comparten `deleteCatalogInDB`.

- DELETE de período valida estado abierto, membresías, inscripciones, cuentas/cobros, cuentas/pagos de facilitadores, gastos, respaldo de publicidad del mes y slots sobre sus horarios (incluidos externos/incoherentes). Luego elimina categorías vacías, asignaciones, horarios, días, ofertas y período. Un fallo revierte todo.
- `periodHasConfigurationOrData` se utiliza exclusivamente para editar la fecha: exige ausencia de configuración y datos, además de período abierto. No se reutiliza como criterio de eliminación.
- `DELETE /offerings/:id` y `DELETE /schedules/:id`, bajo `/api`, validan uso histórico y referencias antes de retirar configuración propia. No borran catálogos ni operaciones.
- Los flags de oferta/horario permanecen como memoria de inscripciones para edición/borrado individual. La eliminación completa del período admite esos flags en 1 cuando no quedan datos operativos/financieros ni referencias protegidas. No modifica flags de filas sobrevivientes.
- Actividades globales se eliminan solo sin ofertas/inscripciones, retirando sus días sugeridos. Facilitadores se eliminan solo sin historia, retirando asignaciones preparatorias; cuentas/pagos, horarios usados, slots, referencias legacy o asignaciones en períodos cerrados bloquean.
- Una cuenta de facilitador protege las asignaciones de su par oferta/facilitador al eliminar horarios: `display_name` participa en su presentación histórica. No se elimina automáticamente ninguna cuenta.

La UI conserva el modal destructivo compartido, con descripciones específicas y errores autoritativos del backend. Los botones globales no dependen de los flags legacy; ofertas/horarios muestran acciones potenciales según sus flags, sin duplicar las comprobaciones financieras en React. Sin cambios de esquema, FK ni migración 010. Ver D015.

## Gastos

Modelo actual:

```text
periods
  ↓
period_expense_categories
  ↓
period_expenses
```

### `period_expense_categories`

- pertenece a un período;
- nombre único dentro del período;
- no existen categorías por defecto;
- puede existir vacía.

### `period_expenses`

- pertenece a una categoría;
- concepto;
- fecha;
- monto `DECIMAL(12,2)`;
- comentario/notas;
- referencia opcional al histórico de publicidad.

Regla temporal: la fecha debe pertenecer al mismo año/mes del período seleccionado.

## Publicidad histórica

- `advertising_investments` se conserva como respaldo histórico.
- El modelo operativo nuevo es Gastos Período.
- `007.sql` migra históricos solo hacia períodos existentes.
- La migración no crea períodos.

## Pagos de facilitadores

Modelo implementado:

- `facilitator_accounts`
- `facilitator_payments`

Cuenta discriminada por oferta del período + facilitador.

Reglas:

- `A pagar` manual;
- pagos parciales permitidos;
- sin sobrepago;
- sin saldo a favor;
- período cerrado bloquea cambios.

## Cobros de alumnos — receptor y medio

`payments` conserva cuenta, fecha, monto DECIMAL(12,2), medio, notas y timestamps. Agrega `recipient VARCHAR(6) CHARACTER SET ascii COLLATE ascii_bin NOT NULL`, sin default y CHECK limitado a jesica/hernan. Receptor pertenece al movimiento, no a monthly_accounts.

Nuevos cobros exigen receptor y medio independientes. Métodos válidos: cash/transfer. Labels: Jésica/Hernán y Efectivo/Transferencia. El backend valida ambos, conserva membresías y bloqueo de período cerrado.

`009.sql` agrega temporalmente nullable, materializa cash → jesica y transfer → hernan solo en nulos, conserva updated_at mediante autoasignación explícita, verifica datos y termina con CHECK y NOT NULL. Guardas SQL abortan ante estructuras o datos inesperados. Reintentos inspeccionan information_schema y no sobrescriben receptores existentes. DDL no es reversible con ROLLBACK. Pausar escrituras hasta completar migración y desplegar código compatible.

Forms exige receptor nuevo. La compatibilidad pre-009 se limita a reconocer hashes de receipts existentes; nunca autoriza escrituras legacy. Duplicados siguen definidos por persona/período/fecha/monto/medio, sin receptor.

El Dashboard agrega total cobrado y seis valores de carteras en una misma consulta, manteniendo la igualdad entre total cobrado y totales de Jésica/Hernán. No cambia otras métricas ni filtra actividades.

## Modelo financiero único

Cartera Independiente y separación especial de Informática evaluadas y descartadas. No hay clasificación PRISMA/Informática ni cuentas o exclusiones especiales.

## Rutas principales

```text
/                     Dashboard
/personas             BBDD Personas
/gestion              Inscriptos Período
/agenda               Agenda Período
/pagos                Cobros Período
/pago-facilitadores   Pago Facilitadores
/publicidad            Gastos Período
/estadisticas          Estadísticas
/configuracion         Configuración
```

La URL `/publicidad` se mantiene por ahora aunque la funcionalidad visible sea `Gastos Período`.
