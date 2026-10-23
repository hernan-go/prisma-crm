# PRISMA CRM — Roadmap

**Actualizado:** 2026-10-23

## Completado recientemente

- Configuración eliminable vs historial real: integrada, desplegada y aprobada en producción por el propietario. Noviembre 2026 eliminado satisfactoriamente. Sin migración. Detalle: `docs/iterations/2026-10-configuration-cleanup-rules.md`.

- Nomenclatura H1 sincronizada con sidebar.
- Estadísticas v1 publicada en `51e247e`: resumen mensual, IPC y desglose de gastos; sustituye al shell inicial.
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

Estadísticas v1 implementada: contratos, motor Decimal, endpoint agregado, seis tarjetas, IPC y desglose de gastos. Según operaciones y verificaciones del propietario confirmadas el 23/10/2026, publicada en `51e247e`, build y smoke productivos aprobados, con migraciones `001–011` aplicadas y registradas. Codex no realizó una comprobación productiva independiente. Detalle y criterios: [iteración 8 — diseño de Estadísticas](iterations/2026-10-statistics-design.md).

- Resumen ejecutivo económico y subtotales con cobertura implementados; siete bloques en acordeones exclusivos aprobados funcionalmente y diseñados, todavía sin implementar.
- Motor determinista reutilizable; Recharts como primera opción, todavía sin instalar ni validar.
- Continuidad principal de personas con inscripción en meses consecutivos, diferenciada de membresías y asistencia.
- Honorarios y gastos operativos separados. El propietario confirmó pagos a facilitadores exclusivamente en su módulo; no se presume duplicación efectiva.
- Sin ganancia neta hasta aprobar el modelo contable.

Secuencia de evolución aprobada, con implementación sujeta a autorización por alcance:

1. Fase actual: gráficos analíticos mensuales del período seleccionado dentro de los siete bloques diseñados. Seleccionar una entrega pequeña con datos existentes, preferentemente sin migración. Los dos gráficos de gastos propuestos siguen pendientes de aprobación; no hay implementación autorizada. Validar Recharts, bundle, accesibilidad y responsive antes de su incorporación.
2. Fase posterior: comparaciones anuales y evolución mensual dentro del año, distinguiendo períodos ausentes, abiertos y cobertura incompleta.
3. Fase futura: análisis histórico completo y rangos personalizados, series económicas nominales y ajustadas por IPC cuando existan datos suficientes. La consulta actual del último IPC y su fallback están implementados; persistencia y serie histórica requieren diseño específico.

Mantener como diseños independientes el historial de bajas y motivos opcionales, su alcance y efectos operativos; y los modelos de tarifas, paquetes, promociones, atribución de ingresos, costos y capacidad previos a simulaciones o rentabilidad. Asistencia y eventos no forman parte de la primera entrega.

### Proyecto posterior independiente — integración analítica con IA

D020 registra la doble finalidad de Estadísticas: herramienta visual de gestión e infraestructura analítica para futuras consultas autorizadas de ChatGPT u otros asistentes, compartiendo cálculos backend. No requiere mostrar en pantalla cada métrica consultable. API, exportación estructurada y MCP son posibilidades sin mecanismo elegido; agregados y detalle desidentificado requieren diseño de autenticación, permisos, privacidad y auditoría, acceso inicialmente de solo lectura y autorización específica. Desidentificar no garantiza anonimato. La integración no está implementada ni autorizada en esta actualización documental.

La interfaz Estadísticas no requiere por sí sola implementar Google ni conectar IA. La autenticación con Google sigue pendiente con su alcance y prioridad existentes. No se implementan MCP, conectores ni chatbot en esta etapa. PDF/reportes conserva su posición posterior.

### Completado — Gastos recurrentes e independencia mensual

Catálogo transversal configurable, asociación explícita de históricos y edición del mismo movimiento por ID; presencia y posición propias del período mediante 011. Migraciones 010–011 validadas en prisma_test, activadas en prisma_dev y aplicadas/registradas en producción según confirmación del propietario del 23/10/2026. Conserva adicionales y reglas D004–D007. [Cierre técnico y validación local](iterations/2026-10-recurring-expenses-implementation.md).

El propietario configuró por UI y amplió el catálogo productivo; no es una lista universal de ocho conceptos. Octubre 2026 quedó reclasificado y conciliado, como confirmación con fecha de corte y sin convertir sus importes en parámetros permanentes. Nuevos importes cero requieren definición expresa; históricos múltiples legítimos permanecen en consulta.

Correcciones de importe y desglose de Estadísticas publicados con Iteración 8. La aprobación manual local previa de diciembre de 2026 se conserva con el alcance registrado en el [informe histórico](iterations/2026-10-recurring-period-independence.md); el cierre productivo posterior está en [PROJECT_STATE](PROJECT_STATE.md). No quedan migraciones ni despliegue pendientes de Iteración 8.

## Prioridad 6 — PDF / reportes

Postergado deliberadamente hasta estabilizar los modelos financieros y Estadísticas.

## Pendiente — Estadísticas anuales e históricas

La secuencia temporal está definida en Prioridad 5. La vista mensual seguirá siendo la principal; las vistas anual e histórica deberán respetar períodos existentes, cobertura y suficiencia de series IPC. Resultados económicos y rentabilidad solo se incorporarán después de completar y aprobar las reglas contables y las limitaciones de honorarios de D021.

Recharts se evaluará en una etapa posterior. Queda pendiente decidir entre un desplegable «Evolución histórica» o su integración en la categoría de evolución económica. Es exclusivamente un pendiente: no hay consultas históricas, filtros anuales, gráficos ni cambios DB implementados para esta ampliación.
