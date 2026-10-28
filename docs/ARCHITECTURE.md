# PRISMA CRM — Arquitectura

## Integración de lectura para asistente — etapa 1 local

Arquitectura autorizada el 25/10/2026: sistema → API segura → complemento MCP privado → ChatGPT, sin API paga de modelos. `GET /api/integrations/ai/monthly-context?period=AAAA-MM` tiene router terminal propio antes de la autenticación administrativa, Bearer independiente verificado por SHA-256, HTTPS con proxy explícito, límites y acceso empresarial completo conforme a D024. Solo SELECT en transacción consistente READ ONLY; reutiliza `readSummaryInput` y `calculateSummary`. Contrato 2.0 en `shared/ai-context.ts`, sin IDs/identidades de participantes ni escrituras; incluye identificación operativa de profesionales y denominaciones empresariales. No aplica umbrales de grupos pequeños. Protección de datos personales obligatoria. Implementación local para revisión; Site sin conectar, sin deploy, migraciones ni cambios de datos. [Contrato, configuración y limitaciones](iterations/2026-10-ai-read-context.md).

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
- Una cuenta de facilitador protege las asignaciones de su par oferta/facilitador al eliminar horarios; se conserva su snapshot `display_name`. La presentación usa el nombre vigente de `instructors` por ID, incluso en períodos cerrados (D009). No se elimina automáticamente ninguna cuenta.

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

El propietario confirmó el 2026-10-22 que los pagos a facilitadores se registran exclusivamente en su módulo, no en Gastos. Ambos dominios se mantienen diferenciados; no se presume duplicación efectiva de datos. Gastos no dispone de un estado estructurado pagado/pendiente.

La organización recurrentes/adicionales fue implementada mediante 010 e independencia mensual 011, validadas en prisma_test y activadas en prisma_dev. Reutiliza categorías y movimientos y configura conceptos por instalación sin categorías automáticas. Según confirmación del propietario del 23/10/2026, ambas migraciones están aplicadas y registradas en producción y la funcionalidad fue publicada en `51e247e`. Codex no realizó verificación productiva independiente. El catálogo productivo fue configurado y ampliado por UI; no asumir ocho conceptos universales. Ver D018 y el apartado técnico de recurrentes debajo.

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

## Dashboard

`client/Dashboard.tsx` consume la selección global que permanece en App. `/api/dashboard` y `/api/agenda` se consultan de forma independiente con claves por período, sin datos anteriores como placeholder. `client/dashboard-model.ts` transforma horarios y calcula fecha/día/hora con Intl y zona argentina explícita; `client/dashboard.css` limita los cambios visuales al Dashboard. El reloj no dispara consultas por minuto. No cambian endpoints, contratos ni cálculos financieros. La integración final agrega `server/weather.ts` y GET /api/weather detrás de la autenticación existente: fetch nativo a MET Norway, caché/revalidación en memoria y selección temporal por solicitud; `client/Weather.tsx` consume una query independiente del período, sin DB ni paquetes nuevos; ver D016 y `iterations/2026-10-dashboard-redesign.md`.

## Estadísticas — v1 publicada y capa analítica compartida

La ruta `/estadisticas` presenta seis tarjetas con cobertura e IPC oficial con fallback explícito. `GET /api/statistics/summary?period_id=<id>` usa autenticación existente y devuelve agregados. Contratos Zod en `shared/statistics.ts`, motor Decimal en `server/statistics/engine.ts` y consultas en `server/statistics/index.ts`. La lectura usa REPEATABLE READ, WITH CONSISTENT SNAPSHOT, READ ONLY, sin bloqueo de personas ni escrituras. Período inexistente: 404; error de consulta: error HTTP, nunca cero. Publicación en `51e247e` y validación productiva confirmadas por el propietario el 23/10/2026; Codex verificó código local, sin nueva comprobación productiva.

La Etapa 1 separa consultas/agregaciones, cálculos puros con Decimal.js (precisión local 40), contratos tipados con eje temporal/cobertura/fuente y presentación. Evitar sumas multiplicadas por joins y consultas que transporten fichas personales completas innecesariamente. El contrato debe distinguir cero, indefinido, ausencia de registros y error; las comparaciones no crean períodos. La primera entrega gráfica de Iteración 9 incorpora localmente Recharts 3.10.1 y react-is 19.3.0, compatible con React instalado. `client/StatisticsExpenseChart.tsx` se carga al abrir el acordeón de Gastos; `client/statistics-expenses.ts` comparte consulta validada y caché por período con el modal existente. No modifica contratos, endpoints ni cálculos del backend. La conversión Number es exclusivamente geométrica; orden exacto por centavos enteros y valores string en tabla/tooltips. Reajuste posterior: dos tiles iguales, barras y anillo de honorarios; este último consume fees_committed/fees_paid/fees_pending y fees_overpaid del resumen existente, sin nuevas consultas ni cálculos de saldos. Tres tramos normalizados contra el mismo comprometido conocido, no una suma de tres magnitudes. Solo representa proporciones con cobertura completa, base positiva y conciliación exacta; ante indefinidos, base cero o sobrepagos muestra contornos y valores exactos. Pagado vacío con cero movimientos se trata como cero registrado. Sin control Ver tabla: alternativa exclusiva para lectores de pantalla y navegación del gráfico. Revisión del propietario y publicación pendientes para esta entrega local.

D020 establece la doble finalidad: gestión visual e infraestructura analítica para futuras consultas autorizadas con IA, sin reconstruir reglas ni depender de capturas. El backend conserva la responsabilidad económica; React y Recharts presentan sus resultados. Gráficos, informes y futuros adaptadores deben reutilizar la misma capa. Cada métrica debe disponer de significado, fórmula, fuente, período, criterio temporal, unidad, cobertura y limitaciones; este es un criterio de evolución, no la afirmación de que todos los contratos actuales ya contienen cada campo. Mantener DECIMAL/Decimal y dinero exacto como strings; cualquier conversión numérica para geometría gráfica no redefine importes ni cálculos económicos.

Separar período económico, fecha efectiva de movimiento y fecha de registro. Inscripciones no prueban asistencia ni ausencia de reinscripción una baja confirmada. Gastos registrados, honorarios comprometidos y pagos son magnitudes distintas; D021 precisa acuerdos mayoritariamente fijos respecto de participantes pero variables por profesional, prestación y período. No calcular ganancia neta o rentabilidad por actividad sin modelos aprobados de ingresos atribuibles y costos.

Estado vigente D024: API de lectura empresarial implementada localmente para el complemento MCP privado; sin conexión al Site ni despliegue. Autenticación y autorización independientes, máxima disponibilidad empresarial sin supresión por tamaño y exclusión de datos personales privados. No garantiza anonimato absoluto ni supone acceso directo a MySQL o multitenancy. La IA recomienda; administradores deciden.

Persistencia del IPC, historial de bajas y modelos de tarifas, paquetes, promociones, atribución y simulaciones requieren diseños específicos. Siete bloques/acordeones exclusivos están diseñados y aprobados funcionalmente; solo Gastos tiene implementación gráfica local, los otros seis siguen pendientes. Evolución prevista: mensual, anual y finalmente histórica con rangos e IPC cuando los datos sean suficientes; integración IA en proyecto posterior independiente. Indicadores v1, plan, límites y decisiones pendientes: [diseño funcional de Estadísticas](iterations/2026-10-statistics-design.md).

## Conocimiento empresarial y asesor IA — diseño conceptual

D022 y D023 establecen tres fuentes complementarias para una futura consulta autorizada:

1. **Base operativa y financiera:** datos e indicadores de la instalación, con la capa determinista de Estadísticas como fuente de cálculo, cobertura y límites económicos.
2. **Base documental privada por instalación:** reglas, objetivos, políticas, decisiones, promociones, eventos y aprendizajes propios, separados del código fuente y del repositorio público.
3. **Fuentes externas verificadas y actualizadas:** contexto geográfico, económico y cultural, con procedencia, fecha de publicación y fecha de consulta explícitas.

La IA consultará mediante la API de lectura y el complemento MCP privado aprobados, con contrato independiente del proveedor y sin API paga de modelos. La interfaz empresarial está implementada localmente; conexión y despliegue pendientes. El Centro de conocimiento privado tendrá su propia gestión dentro del sistema en una etapa posterior: almacenamiento y recuperación documental aún pendientes, sin escrituras operativas de IA ni entrenamiento implícito por consultar documentos. Fuentes externas futuras: inflación, ANSES, poder adquisitivo, mercado rosarino y calendario/eventos, siempre con fuente/fecha (D024).

Separar responsabilidades en el diseño posterior:

- **Almacenamiento y conservación:** documentos privados, versiones, activación/desactivación, exportación, recuperación de archivos y respaldos; aislamiento entre instalaciones independientes.
- **Permisos:** identidad autorizada y acceso a fuentes/documentos concretos, sin inferir acceso por la mera existencia de un archivo ni compartir información entre empresas.
- **Recuperación documental:** selección de documentos pertinentes y vigentes, con procedencia y versión; distinguir recuperación de información de restauración de archivos o respaldos.
- **Instrucciones del negocio:** instrucciones del asesor separadas de los documentos de conocimiento empresarial; ninguna constituye una autorización operativa.
- **Controles de seguridad:** autenticación, privacidad, auditoría y límites de lectura; el contenido documental o externo no puede anular las políticas de seguridad ni conceder permisos.

La futura Base de Conocimiento permitirá cargar, crear, editar, consultar, activar/desactivar, exportar y recuperar Markdown con historial de versiones y respaldos. Estas capacidades requieren diseño e implementación propios. El modelo será reutilizable por distintas empresas sin implicar SaaS ni multitenancy. Los archivos privados locales excluidos de Git son una organización documental inicial: necesitan respaldos independientes y no equivalen al módulo futuro ni a un sistema de versiones implementado.

## Gastos recurrentes — 010–011 implementadas y publicadas

expense_recurring_concepts es catálogo transversal configurable; period_expense_categories.recurring_concept_id es referencia opcional con FK RESTRICT y UNIQUE(period_id,recurring_concept_id). period_expenses.recurring_single marca el único movimiento mensual canónico; una columna generada VIRTUAL y UNIQUE impiden dos marcados por categoría. Importes permanecen DECIMAL(12,2) en period_expenses. 010 no configura catálogo, no crea períodos/categorías ni actualiza históricos.

shared/recurring-expenses.ts contiene contratos y preset explícito. server/recurring-expenses.ts concentra catálogo, consulta mensual, vínculo/desvínculo y PUT mensual, con peopleTransaction, openPeriod, locking reads y control optimista de ID/campos previos. server/expenses.ts bloquea todas sus escrituras genéricas sobre categorías vinculadas o con marcador incoherente. La eliminación existente de períodos bloquea cualquier movimiento antes de retirar categorías vacías; no crea otra vía para eliminar dinero. Todos los endpoints heredan autenticación y controles de origen existentes.

GET /api/expense-recurring-concepts; POST del mismo recurso y PUT /:conceptId administran catálogo. POST /prisma-preset requiere confirmación PRISMA y catálogo vacío. GET /api/periods/:periodId/recurring-expenses resuelve catálogo y movimientos en una sola consulta; PUT /:conceptId guarda y POST/DELETE /:conceptId/link vincula por category_id explícito. DELETE /periods/:periodId/recurring-expenses/:conceptId/amount elimina, tras confirmación y comparación de ID/importe, solo el movimiento canónico único del período; no borra la categoría ni el concepto. Período cerrado, históricos múltiples o estado cambiado se rechazan. No hay DELETE global de conceptos; la disponibilidad del catálogo es general.

`GET /api/statistics/expenses?period_id=<id>` devuelve desglose read-only de categorías con movimientos del período seleccionado, agrupado por vínculo recurrente y calculado con DECIMAL en un snapshot consistente. Las categorías vacías se omiten; el total y el conteo deben reconciliar con el KPI de Gastos registrados. No expresa pago realizado. La UI invalida/actualiza datos tras escrituras por las claves de consulta existentes.

011 agrega period_recurring_settings (period_id PK/FK RESTRICT a periods; revision BIGINT UNSIGNED) y period_recurring_concepts (PK período/concepto, posición INT UNSIGNED >=1 única por período, timestamps; FK RESTRICT a settings y catálogo). La lectura mensual devuelve {revision, tiles}, solo desde presencias persistidas; cada revisión viaja como string decimal sin conversión a Number. Las mutaciones de presencia, posición, importe y vínculos validan revisión bajo peopleTransaction y locks; avanzan revisión en la misma transacción. POST/DELETE /periods/:periodId/recurring-expenses/:conceptId/presence agregan/quitan; PUT /position desplaza y compacta 1..N con posiciones temporales para respetar UNIQUE. GET diagnostica movimientos recurrentes sin presencia; Estadísticas los conserva en sus sumas.

La creación explícita de períodos inicializa settings y conceptos activos sin categorías ni dinero, incluso en clone_previous. La eliminación de períodos sin datos borra explícitamente presencias/settings antes del período; editar fecha con presencias se bloquea como configuración existente. Quitar importe requiere revisión y estado económico completo; quitar del período exige la misma expectativa o null y bloquea múltiples/no canónicos. Sin registro 011 se responde 503 explícito para funcionalidades dependientes, sin fallback global. Activación completada en prisma_test y prisma_dev; producción confirmada por el propietario el 23/10/2026. [Informe y runbook histórico](iterations/2026-10-recurring-period-independence.md); cierre vigente en [PROJECT_STATE](PROJECT_STATE.md).

El índice no impide SQL administrativo sin marcador: la consulta detecta múltiples/no canónicos, muestra subtotal y bloquea edición simplificada. Históricos legítimos múltiples quedan en consulta. Los importes no se clonan; la presencia inicial toma el catálogo activo al crear el período. [Operación, validación y recuperación](iterations/2026-10-recurring-expenses-implementation.md).
