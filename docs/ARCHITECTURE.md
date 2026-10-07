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

## Períodos

Estados actuales:

- `open`
- `closed`

Un período cerrado:

- sigue siendo consultable;
- bloquea operaciones de escritura;
- puede reabrirse explícitamente para correcciones históricas.

Los períodos son entidades de negocio explícitas. Nunca deben surgir como efecto secundario de una fecha, gasto, importación o migración.

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

## Cobros de alumnos — deuda de diseño

Actualmente el medio de pago sigue necesitando ser separado del receptor.

Diseño futuro:

```text
Receptor: Hernán | Jesica
Medio:    Efectivo | Transferencia
```

Las cuatro combinaciones deben ser válidas.

## Informática — deuda de diseño

Las clases particulares de informática son ingresos exclusivos de Hernán y no deben mezclarse con ingresos mensuales PRISMA.

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
