# PRISMA CRM — Roadmap

**Actualizado:** 2026-10-22

## Completado recientemente

- Configuración eliminable vs historial real: integrada, desplegada y aprobada en producción por el propietario. Noviembre 2026 eliminado satisfactoriamente. Sin migración. Detalle: `docs/iterations/2026-10-configuration-cleanup-rules.md`.

- Nomenclatura H1 sincronizada con sidebar.
- Sección `Estadísticas` creada como shell visual.
- `Gastos Período` implementado con categorías personalizables y movimientos.
- Migración `007.sql` aplicada en producción.

- Clonación de configuración al crear período: validada y aprobada manualmente, incorporada a Git en `a073783`. Documento de cierre histórico: `docs/iterations/2026-10-clone-period-config.md`.

## Completado — Inscriptos Período

- Membresías explícitas integradas y desplegadas. `008.sql` aplicada en producción, `main` en `a599378` y smoke test aprobado, confirmados por el usuario.
- Se conservan las reglas documentadas en D014.

## Completado — Cobros Período: receptor ≠ medio

- Implementación local de las cuatro combinaciones Jésica/Hernán × Efectivo/Transferencia.
- `009.sql`: backfill histórico exacto, timestamps preservados y receptor final obligatorio.
- Forms compatible con receipts anteriores; nuevas escrituras siempre requieren receptor.
- Carteras del mes desglosadas por receptor/medio, sin rediseño general.
- `009.sql` aplicada en `prisma_test` y `prisma_dev`. Todos los tests aprobados y revisión manual local aprobada por el usuario; pruebas destructivas y de recuperación exclusivamente en `prisma_test`.
- Cierre confirmado por el usuario: `009.sql` aplicada y registrada en producción; `main` en `df04f17`, deploy `1791429132-5kurej`, build exit code `0`, smoke aprobado e históricos agosto/septiembre/octubre reconciliados.
- Documento: `docs/iterations/2026-10-payment-recipients.md`.

## Decisión de alcance — Informática

Cartera Independiente y separación especial de ingresos/deuda de Informática evaluadas y descartadas. Modelo financiero único para PRISMA. No clasificar ni excluir movimientos por nombre de actividad.

## Iteración 6 — Dashboard desplegado y verificado en producción

Nuevo diseño operativo/administrativo implementado en `codex/dashboard-redesign`, sin cambios financieros ni DB. Fecha/hora argentina, agenda semanal por período y ayudas accesibles. Clima de Rosario implementado mediante MET Norway Locationforecast 2.0, con proxy/caché en memoria, atribución CC BY 4.0 y sin dependencia del período. Revisión visual desktop/mobile y MET Norway aprobada por el propietario el 2026-10-15. Cierre productivo confirmado por el propietario y registrado el 2026-10-20: integrado a `main`, push realizado, HEAD `e13f952`, build SiteGround con exit code `0` y Dashboard/clima verificados visualmente en producción. Sin nuevas migraciones ni pruebas productivas adicionales desde Codex. Detalle: `docs/iterations/2026-10-dashboard-redesign.md`.

## Completado — Iteración 7: unificación UX/UI, responsive y mantenimiento

Completada, publicada y validada visualmente en producción, según confirmación del propietario. Ocho commits integrados y publicados en `main`, HEAD `06f3d1f69ef6e84be55279b4dbd394a888a74b6b`; push manual del propietario, SiteGround con `build_script_exit_code = 0` y revisión visual desktop/mobile aprobada, incluida la última corrección de BBDD Personas.

- Regularización documental de la iteración 6, header a 701px y README MySQL actualizado.
- Horarios no vigentes agrupados y Configuración rediseñada.
- Módulos administrativos unificados, Dashboard mobile ajustado y refinamientos finales de tablas, Agenda y componentes financieros.
- Regresión mobile de BBDD Personas corregida, conservando sus tres columnas y estado circular accesible sin scroll horizontal; seis columnas desde 701px.

Validación local de cierre: typecheck, lint, 169 pruebas, build y diff check aprobados; 157 integraciones DB omitidas. Sin migraciones SQL nuevas. Codex no realizó verificaciones productivas adicionales ni auditorías de datos. [Registro de cierre e historial](iterations/2026-10-maintenance.md). La siguiente iteración funcional no reabre la iteración 7.

## Pendiente de desarrollo — Autenticación con Google

Decisión de producto confirmada expresamente por el propietario: PRISMA CRM incorporará inicio de sesión mediante una cuenta de Google. Es una funcionalidad decidida y pendiente de desarrollo, no una posibilidad opcional.

Alcance preliminar:

- Inicio de sesión mediante Google.
- OAuth 2.0 y OpenID Connect.
- Acceso restringido a usuarios expresamente autorizados.
- Verificación segura de identidad y sesiones.
- Evaluación del reemplazo o convivencia temporal con la contraseña administrativa actual.
- Evitar servicios pagos de autenticación cuando exista una implementación directa adecuada sin tarifa adicional.
- Mantener el sistema específico de PRISMA, sin convertirlo en un SaaS multiempresa.

El diseño técnico definitivo todavía debe realizarse. No están decididos la arquitectura, el esquema de usuarios, el mecanismo de sesiones ni posibles migraciones. No se implementa autenticación en este cierre documental ni se modifica la autenticación actual.

## Pendiente — Definición del resultado económico mensual

Definir y diseñar en otra iteración la incorporación de egresos y el resultado/neto mensual. La iteración 7 no agrega cálculos financieros. Se conserva este pendiente y su relación con Estadísticas e informes.

## Completado — Rediseño mobile

Alcance exclusivo `max-width: 700px`; tablet/desktop desde `701px` conservan su diseño. Implementación y revisión visual manual final aprobadas:

- header común sin sticky: PRISMA + hamburguesa / título + ayuda / período + selector + creación `+`, con alineación compartida;
- hamburguesa con nueve secciones y cierre de sesión al final;
- descripciones en ayuda accesible;
- Dashboard 2x2, Personas y Cobros con tres columnas;
- CTAs principales a izquierda y footer oculto solo en mobile;
- Agenda/Gastos y recorridos restantes con adaptaciones conservadoras;
- sin nuevas dependencias, cambios de negocio ni DB.

Validación automática aprobada: typecheck, lint, 116 tests aprobados y 114 integraciones DB omitidas, build y diff check. Revisión manual aprobada por el usuario en 390×900 (menú cerrado/abierto y secciones principales), 700/701px, 768px y 1024px, sin overflow horizontal observado y con tablet/desktop preservados.

Documento: `docs/iterations/2026-10-mobile-redesign.md`. Cierre posterior confirmado por el propietario: integrado, desplegado y aprobado en producción. También está desplegada y aprobada la eliminación de cuentas mensuales estrictamente vacías.

## Prioridad 5 — Estadísticas

Etapa 1 autorizada posteriormente e implementada localmente: contratos, motor Decimal, endpoint agregado y seis tarjetas del resumen. Validación local aprobada; pendiente de revisión del propietario, integración y producción. Definiciones funcionales principales aprobadas por Hernán el 2026-10-22. Detalle y criterios: [iteración 8 — diseño de Estadísticas](iterations/2026-10-statistics-design.md).

- Resumen ejecutivo económico, subtotales con cobertura y siete acordeones con una sola categoría abierta.
- Motor determinista reutilizable; Recharts como primera opción, todavía sin instalar ni validar.
- Continuidad principal de personas con inscripción en meses consecutivos, diferenciada de membresías y asistencia.
- Honorarios y gastos operativos separados. El propietario confirmó pagos a facilitadores exclusivamente en su módulo; no se presume duplicación efectiva.
- Sin ganancia neta hasta aprobar el modelo contable.

Secuencia propuesta, sujeta a autorización por alcance:

1. Etapa 1 implementada localmente: resumen y contratos con datos existentes, sin migraciones. Revisar antes de integrar.
2. Incorporar acordeones, gráficos, comparaciones nominales y continuidad descriptiva; validar dependencia gráfica, bundle y accesibilidad.
3. Consulta de IPC oficial y recuperación ante fallos implementadas localmente; persistencia e historia de IPC siguen pendientes de diseño y autorización.
4. Incorporar registro histórico de bajas por actividad/vínculo general, con fecha y motivo opcional, preservando historia; efectos operativos y migración pendientes.
5. Ampliar tarifas, paquetes, atribución de ingresos, costos y capacidad antes de desarrollar simulaciones y contribución por taller.

La interfaz Estadísticas no requiere por sí sola implementar Google ni conectar IA. La autenticación con Google sigue pendiente con su alcance y prioridad existentes. No se implementan MCP, conectores ni chatbot en esta etapa. PDF/reportes conserva su posición posterior.

### Tarea coordinada — Gastos recurrentes implementados localmente

Ocho tarjetas configurables, catálogo transversal, asociación explícita de históricos y edición del mismo movimiento por ID. Migración 010 validada en prisma_test y aplicada posteriormente de forma controlada en prisma_dev; sin cambios de fórmulas de Estadísticas, IPC o facilitadores. Conserva adicionales y reglas D004–D007. [Cierre técnico y validación](iterations/2026-10-recurring-expenses-implementation.md).

El propietario informó después que configuró y probó manualmente los ocho conceptos de PRISMA en `prisma_dev`. La aplicación de 010 y su postflight ya fueron completados con autorización independiente. Producción sigue en 001–009; aplicación manual, integración y despliegue todavía pendientes. Nuevos importes cero requieren definición expresa; históricos múltiples legítimos permanecen en consulta.

Correcciones de importe y desglose de Estadísticas implementadas localmente. 011 e independencia mensual validadas en prisma_test y activadas controladamente en prisma_dev. Hernán aprobó manualmente diciembre de 2026: conciliación de $860.000, posiciones independientes, renumeración, retiro de Luz sin importe, persistencia entre períodos y reincorporación. Próximo paso: revisión de los tres commits locales y preparación autorizada de integración/producción. [Informe y plan de integración](iterations/2026-10-recurring-period-independence.md).

## Prioridad 6 — PDF / reportes

Postergado deliberadamente hasta estabilizar los modelos financieros y Estadísticas.

## Pendiente — Estadísticas anuales e históricas

La vista mensual seguirá siendo la principal, vinculada al período seleccionado. Se planifica una vista anual seleccionable con evolución de los doce meses y una vista histórica desde el primer período registrado, con rangos personalizados de fechas/años y comparación de ingresos, cobranzas, gastos y honorarios. Deberá cruzar cada mes con su IPC oficial y distinguir evolución nominal de evolución ajustada por inflación. Resultados económicos y rentabilidad solo se incorporarán después de completar y aprobar las reglas contables.

Recharts se evaluará en una etapa posterior. Queda pendiente decidir entre un desplegable «Evolución histórica» o su integración en la categoría de evolución económica. Es exclusivamente un pendiente: no hay consultas históricas, filtros anuales, gráficos ni cambios DB implementados para esta ampliación.
