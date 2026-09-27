# Modelo mensual y facilitadores — migración 005

Este documento describe el modelo vigente y reemplaza las asignaciones globales descritas en documentos históricos anteriores. Mantiene React, Express, mysql2, autenticación, PWA y contabilidad existentes, sin nuevas dependencias.

## Estructura

- `activities`: catálogo global; nombre, modalidad y días sugeridos para nuevas ofertas. `instructor_id` queda nullable por compatibilidad, sin uso como fuente de asignaciones nuevas. `ever_used` impide eliminar registros que tuvieron uso, incluso después de cancelar inscripciones.
- `period_activities`: una oferta por actividad/período. Guarda nombre y modalidad propios, disponibilidad y uso histórico. No se copian ofertas automáticamente entre meses.
- `period_activity_days`: días permitidos de cada oferta.
- `activity_schedules`: bloques compartidos con oferta, día, inicio, fin, habilitación y uso histórico. Horas entre 09:00 y 20:00, cada 30 minutos; fin mayor que inicio.
- `schedule_instructors`: relación many-to-many de horarios con facilitadores; clave compuesta sin límite de dos facilitadores. `display_name` conserva el nombre al asignarlo. Cero facilitadores es válido.
- `enrollment_slots.schedule_id`: referencia al bloque real; los campos anteriores de día y horas se conservan por compatibilidad. Varios asistentes grupales referencian el mismo bloque.
- `instructors`: nombre obligatorio; apellido, DNI, teléfono, email y dirección opcionales. Email válido cuando se carga, sin unicidad por documento/contacto ni restricción de nombres repetidos. `ever_used` protege su historial. No son personas inscritas ni usuarios del sistema.

## Configuración y operación

Crear manualmente catálogo y facilitadores; seleccionar un período y agregar sus ofertas. Configurar modalidad, días, horarios y todos sus facilitadores antes de inscribir o importar. El seed no crea, reactiva ni sobrescribe datos operativos.

Archivar una actividad global bloquea nuevas inscripciones; no ofrecerla un mes afecta solo esa oferta. Inactivar un facilitador conserva referencias, pero impide nuevas asignaciones. Eliminación física solo para catálogo/facilitadores sin uso ni referencias; los demás se inactivan. La herramienta de limpieza QA también respeta esta protección.

Una oferta utilizada no cambia de modalidad. Un horario utilizado conserva día, horas y asignaciones; para cambiarlos crear otro horario y deshabilitar el anterior. Editar una inscripción permite conservar o quitar referencias deshabilitadas ya existentes, pero no agregarlas como nuevas. No se reescriben nombres históricos al renombrar catálogo o facilitadores. Los períodos cerrados bloquean cambios de ofertas, horarios e inscripciones.

Grupal permite varios asistentes en el mismo ID de horario. Individual admite uno por bloque; puede tener varios bloques con horarios/facilitadores distintos. Una persona no se solapa consigo misma. Cualquier facilitador compartido impide solapar bloques diferentes; horarios consecutivos se permiten. Horarios habilitados de ofertas activas reservan facilitadores aun sin asistentes. Una oferta deshabilitada sin asistentes libera la reserva; reactivarla vuelve a validar conflictos. Bloques con asistentes siguen reservados aunque se deshabiliten. Las escrituras comparten el bloqueo transaccional MySQL existente.

Agenda muestra bloques compartidos, incluidos los vacíos, con todos sus facilitadores y asistentes; permite filtrar período, actividad, día, hora y cualquiera de los facilitadores. El Dashboard usa nombres de ofertas históricas, no nombres actuales del catálogo.

## Google Forms

Preview resuelve actividad + día + horas exclusivamente contra horarios habilitados de la oferta del período. Una coincidencia selecciona el ID y todos sus facilitadores; cero o varias coincidencias requieren revisión manual. Se puede elegir un horario configurado o excluir la inscripción. No genera horarios ni facilitadores ni usa `activities.instructor_id`.

La vista previa no escribe datos. Al confirmar vuelve a validar horarios, asignaciones, disponibilidad, duplicados, capacidad y conflictos. Un error revierte personas, inscripciones, cuentas, pagos y recibo del lote. Se conserva la protección de reintentos mediante `import_receipts`. El importador genérico XLSX/CSV de personas permanece independiente.

## Migración desde 004

`server/migrations/005.sql` es adicional; 001–004 no se modifican. Crea ofertas únicamente para actividades/períodos con inscripciones existentes, copia nombre/modalidad y días, y agrupa slots idénticos en un único horario compartido. Copia el facilitador legado a cada bloque y conecta las inscripciones por `schedule_id`. Agrega días históricos aunque ya no estén en la regla global, para no perder registros. Marca configuración utilizada.

No borra ni modifica personas, cuentas, pagos, publicidad, sesiones o recibos. Conserva los valores legacy de `activities.instructor_id`, pero nuevas operaciones no los consultan. No puede reconstruir asignaciones anteriores que el esquema viejo ya hubiese sobrescrito: migra la asignación disponible al ejecutar 005. Tampoco resuelve silenciosamente solapamientos inconsistentes preexistentes.

Aplicar primero a una copia respaldada, con escrituras pausadas, comparar recuentos, inscripciones y saldos y luego revisar ofertas/horarios manualmente. El runner registra cada migración en `schema_migrations` y no la repite si completó. MySQL hace commit implícito de DDL: una interrupción parcial necesita inspección/restauración; no prometer rollback de esquema ni reejecutar 005 manualmente a ciegas.

En esta ronda 005 se ejecutó únicamente sobre `prisma_test`; no se migró la base operativa local ni producción. No se importaron datos reales. Antes de usar el modelo en la base operativa, respaldar y aplicar la migración con el procedimiento anterior.

## Pruebas

La suite MySQL requiere `RUN_DB_TESTS=true` y `DB_NAME=prisma_test`; verifica también el nombre de la conexión antes de recrear sus tablas. Fixtures sintéticos exclusivamente de tests, separados del seed. Cubre migración 004→005 y reejecución del runner, conservación financiera y de sesión, ofertas independientes, cero/tres facilitadores, grupos, individuales, conflictos, historial, eliminación segura, Agenda, Dashboard e importación con rollback.

Ver el informe de ejecución más reciente en `QA.md`. No se hicieron commits, push ni cambios de producción en esta ronda.
