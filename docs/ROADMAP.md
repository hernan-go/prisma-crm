# PRISMA CRM — Roadmap

## Resumen vigente — 07/11/2026

Estadísticas v2 mensual y anual publicada y aceptada; P0 aceptado en su alcance empresarial consultivo, con issue #2 cerrada el 06/11/2026 según confirmación del propietario. MCP privado versión 6, Know-How real/propuestas y Eventos operativos. [Estado productivo y límites](PROJECT_STATE.md).

Se conserva el orden aprobado de las iniciativas, sin asignar fechas ni iteraciones nuevas. Permanecen pendientes Google Login, ayuda contextual y recorridos guiados, informes PDF y los controles de seguridad, recuperación y resiliencia aún no verificados. Las PWA para facilitadores y participantes son iniciativas futuras sin autorización de implementación. Historial completo/rangos, flujo de caja, IPC histórico y modelos financieros avanzados se distinguen de Estadísticas v2 entregada.


## Iteración 10.2 — cierre técnico productivo (06/11/2026)

Eventos Especiales: CRM `92d97ed` desplegado en SiteGround; migraciones `014–016` verificadas en producción y 184 pruebas MySQL pendientes aprobadas. MCP privado versión 6 (`4350bcb`) desplegado y su catálogo actualizado en ChatGPT: cinco herramientas disponibles, incluida `consultar_eventos_especiales`; consulta real de noviembre 2026 correcta (sin eventos). Anomalía local de `remaining-skeletons.test.ts` resuelta sin modificar contenido. [Estado y límites](PROJECT_STATE.md#estado-vigente--iteración-102-cerrada-técnicamente-06112026) · [Evidencia del cierre](iterations/2026-11-special-events-stage-3.md).

Permanecen como límites **no comprobados**: escrituras reales de Eventos en producción, ensayo de rollback del Site y auditoría integral de seguridad. No reabrir la implementación 10.2 ni reejecutar pruebas/migraciones solo para subsanar estados documentales antiguos. Las prioridades funcionales generales siguientes se mantienen; sus referencias antiguas a herramientas ficticias o entregas no desplegadas son antecedentes y quedan subordinadas al estado vigente anterior.

## Iteración 10.1 — completada (02/11/2026)

Propuestas autorizadas ChatGPT → CRM, revisión administrativa, aprobación/rechazo y consulta de recibos operativos en producción; Site MCP privado versión 5. Migración 013 registrada. [Evidencia de cierre](iterations/2026-11-knowledge-proposals.md#cierre-productivo--02112026). Las referencias históricas a publicación pendiente de esta entrega quedan superadas. No se cierran ni reordenan las prioridades generales siguientes. prisma_demo conserva un pendiente ambiental de migración/revalidación, separado del circuito productivo.

**Corte histórico de esta sección: 2026-10-29 (superado por los cierres de 10.1 y 10.2 anteriores).**

Actualización local 29/10: [Know-How IA, Entrega 1 y corrección de Facilitadores](iterations/2026-10-knowledge-library.md#cierre-local-integrado-y-qa-del-propietario--29102026) integradas en `0a16424`, validadas y aprobadas manualmente en `prisma_dev`. `012.sql` aplicada en desarrollo y pruebas; pendiente en producción. Próximo paso: preflight productivo, sin autorización implícita de migración ni despliegue. Entregas posteriores de historial/restauración, retención/papelera y respaldos integrales pendientes. La biblioteca no se conecta todavía al asesor IA; integración MCP existente intacta. Iteración 9 abierta y demás prioridades conservadas.

## PRIORIDAD P0 — MÁXIMA: planificación comercial con IA

Conexión de lectura completada el 27/10/2026: ChatGPT ↔ Site MCP privado ↔ API empresarial 2.0 desplegada en SiteGround, con consulta real de octubre de 2026 exitosa desde Work y ChatGPT normal, confirmada por el propietario. Backend publicado en `448554f`; Worker respaldado en el repositorio privado [hernan-go/prisma-mcp](https://github.com/hernan-go/prisma-mcp), commit `25487c43778370fce101e24f697b011ff7201219`, tag `v1.0.0`, con 23 pruebas sintéticas aprobadas. Sin API paga de modelos ni escritura operativa. D024 mantiene acceso empresarial completo y protección personal. [Estado y límites actuales](PROJECT_STATE.md#prioridad-estratégica-p0--planificación-comercial-con-ia); la [entrega de la API](iterations/2026-10-ai-read-context.md) se conserva como antecedente.

El propietario aprobó la [especificación funcional de planificación comercial con IA](AI_COMMERCIAL_PLANNING.md) como objetivo estratégico principal: una primera carta útil de alternativas comerciales y eventos, con precios concretos, fundamentos económicos y conversación iterativa. **Estado actual:** conexión MCP, Centro de Conocimiento real y lectura de Eventos 10.2 implementados, publicados y consultados. El asesoramiento y las simulaciones hipotéticas ya son posibles en ChatGPT, con datos reales y supuestos explícitos; **P0 aceptado en alcance consultivo**, con issue #2 cerrada el 06/11/2026 según el propietario. Los modelos deterministas/estructurados para certificar rentabilidad, atribuir ingresos/costos por actividad o automatizar escenarios no están implementados. Ver [issue #2](https://github.com/hernan-go/prisma-crm/issues/2).

Esta prioridad conserva su orden y no amplía autorizaciones de implementación ni escritura operativa. D020–D024, la especificación funcional y el contenido empresarial privado fuera de Git siguen siendo referencias. La biblioteca empresarial ya está publicada y conectada al MCP; son **históricas** las menciones posteriores a su ausencia o a sus fixtures de 2026-10. Las extensiones pendientes de estadística, tarifas y simulación se evalúan por separado. Las referencias a «Iteración 9 abierta» describen cortes antiguos, no el cierre de 10.2.

## Completado recientemente

- Conexión MCP privada publicada y validada con cinco herramientas en Site versión 6 (10.2); procedimiento de actualización de catálogo y redespliegue del mismo Site mediante Work/Sites documentado. **No** hay ensayo verificado de rollback a una versión anterior; la restauración real sigue como control distinto.

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

## Implementación local; habilitación pendiente — Autenticación con Google

Decisión de producto confirmada por el propietario. Al 10/11/2026, fundamentos y backend B1–B3 publicados con CI aprobado según su confirmación; recuperación administrativa B4 e interfaz Google B5 implementadas localmente, pendientes de revisión/commit. No equivale a habilitación ni despliegue productivo. [Estado y pasos operativos](iterations/2026-11-google-login.md#bloques-4-y-5--entrega-local-10112026).

Alcance vigente:

- Inicio de sesión mediante Google.
- OAuth 2.0 y OpenID Connect.
- Acceso restringido a usuarios expresamente autorizados.
- Verificación segura de identidad y sesiones.
- Convivencia temporal explícita con la contraseña compartida y retirada posterior autorizada.
- Evitar servicios pagos de autenticación cuando exista una implementación directa adecuada sin tarifa adicional.
- Mantener el sistema específico de PRISMA, sin convertirlo en un SaaS multiempresa.

Pendientes: preparar/aplicar controladamente 020 y comprobar intentos históricos sin asociación en el entorno elegido; configuración/habilitación efectiva; aceptación visual y pruebas reales de Hernán y Jesica; retirada del acceso compartido e integración/despliegue autorizados. No se implementa Google para facilitadores en esta entrega ni se decide su mecanismo futuro.

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

## Prioridad 5 — Estadísticas: mensual y anual completadas

Estadísticas v2 publicada en `77c451983167bdc008098654a9b4b8fad55ff1a0` y aceptada visualmente en producción por el propietario. Incluye seis KPI, cuatro paneles mensuales, Eventos y evolución anual de obligaciones/cobros, personas únicas, continuidad e incorporaciones. [Cierre productivo](PROJECT_STATE.md) · [Evidencia técnica](iterations/2026-11-statistics-monthly-v2.md).

La evolución anual ya no es pendiente. Análisis histórico completo con rangos personalizados, series ajustadas por IPC, flujo de caja y modelos económicos adicionales requieren diseños y autorizaciones separados. Último IPC oficial disponible no equivale a una serie histórica. Se conservan precisión, cobertura parcial, períodos inexistentes distintos de cero y honorarios separados de gastos; sin ganancia neta ni atribución automática por actividad.

### Integración analítica con IA — lectura conectada

D020 registra la doble finalidad de Estadísticas: herramienta visual de gestión e infraestructura analítica para consultas autorizadas de ChatGPT u otros asistentes, compartiendo cálculos backend. No requiere mostrar en pantalla cada métrica consultable. La arquitectura API segura de lectura → complemento MCP privado → ChatGPT está desplegada y conectada desde el 27/10. D024 sustituye la supresión por acceso empresarial completo con protección de datos personales. Autenticación, permisos y trazabilidad obligatorios; desidentificar no garantiza anonimato.

La interfaz Estadísticas no requiere por sí sola implementar Google. La autenticación con Google sigue pendiente con su alcance y prioridad existentes. La conexión MCP, el conocimiento empresarial real y Eventos están publicados. El asesor conversacional puede elaborar escenarios hipotéticos; el alcance P0 consultivo está aceptado; no se implementó un motor financiero estructurado certificado. PDF/reportes conserva su posición posterior.

### Completado — Gastos recurrentes e independencia mensual

Catálogo transversal configurable, asociación explícita de históricos y edición del mismo movimiento por ID; presencia y posición propias del período mediante 011. Migraciones 010–011 validadas en prisma_test, activadas en prisma_dev y aplicadas/registradas en producción según confirmación del propietario del 23/10/2026. Conserva adicionales y reglas D004–D007. [Cierre técnico y validación local](iterations/2026-10-recurring-expenses-implementation.md).

El propietario configuró por UI y amplió el catálogo productivo; no es una lista universal de ocho conceptos. Octubre 2026 quedó reclasificado y conciliado, como confirmación con fecha de corte y sin convertir sus importes en parámetros permanentes. Nuevos importes cero requieren definición expresa; históricos múltiples legítimos permanecen en consulta.

Correcciones de importe y desglose de Estadísticas publicados con Iteración 8. La aprobación manual local previa de diciembre de 2026 se conserva con el alcance registrado en el [informe histórico](iterations/2026-10-recurring-period-independence.md); el cierre productivo posterior está en [PROJECT_STATE](PROJECT_STATE.md). No quedan migraciones ni despliegue pendientes de Iteración 8.

### Antecedente histórico — selección analítica del 23/10/2026

Clasificación confirmada por el propietario el 23/10/2026. Estado al 27/10: 3 de 6 gráficos principales publicados. Gastos, Honorarios y Cobranzas están publicados y validados por el propietario, según los cierres del 24/10/2026; los otros tres siguen pendientes. La clasificación no autoriza implementarlos todos ahora.

| Gráfico primario                | Alcance y estado                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Gastos por concepto          | Todos los recurrentes y adicionales del período; publicado en `ab7e321`, validado por el propietario.                                                   |
| 2. Honorarios por facilitador   | Dona dinámica individual, avance según su importe a pagar; publicado en `ab7e321`, validado por el propietario.                                         |
| 3. Estado de cobranzas          | Publicado en `b4b8408`, validado por el propietario; aplicado/pendiente de obligaciones definidas y porcentaje, referencias y cobertura separadas.      |
| 4. Inscripciones por actividad  | Personas inscriptas en cada taller y mayor/menor demanda registrada; pendiente, sin inferir asistencia.                                                 |
| 5. Continuidad de participantes | Permanencia, nuevas inscripciones y personas sin reinscripción entre períodos; futuro, sin equiparar ausencia de reinscripción con abandono confirmado. |
| 6. Evolución económica          | Tendencias mensuales/anuales de ingresos, gastos y honorarios; futuro, con histórico suficiente y ejes económicos explícitos.                           |

Secundarios opcionales, únicamente si aportan valor real sin duplicar información:

7. Cobros por medio y receptor: distribución de cobranzas.
8. Inscripciones por horario: demanda según días y horarios.
9. Participantes con múltiples actividades: distribución por cantidad de talleres contratados.
10. Composición de gastos: proporción entre recurrentes y adicionales.
11. Honorarios por importe: comparación de importes a pagar entre facilitadores.

Mantener una sección atractiva, clara y compacta. La futura IA podrá consultar más métricas que las representadas gráficamente. Esta clasificación no redefine los siete bloques de navegación ni agrega autorizaciones de desarrollo. Rentabilidad por actividad, tarifas, promociones, eventos, simulaciones y ajustes IPC requieren definiciones específicas. El detalle de las entregas gráficas y sus cierres permanece en el documento de iteración, sin duplicarlo aquí.

## Evolución funcional — estrategia empresarial y asesor IA

Orden de prioridad y dependencias registrado el 23/10/2026; **estados reconciliados al 07/11/2026** sin reordenar prioridades ni conceder nuevas autorizaciones. Estadísticas v2 mensual/anual, MCP de cinco herramientas, Know-How real y Eventos están publicados. El asesor P0 está aceptado en alcance consultivo; modelos financieros estructurados avanzados permanecen separados y no implementados. La tabla conserva su **orden de diseño histórico**, pero distingue los hitos operativos ya implementados.

| Orden | Capacidad futura                                                 | Dependencias y límites                                                                                                                                                                                                         |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Finalización de Estadísticas mensuales                           | Mensual y anual publicadas y aceptadas en Iteración 11, incluida Inscripciones por actividad. Análisis adicionales requieren alcance propio; preservar cobertura y precisión.               |
| 2     | Tarifas, planes y paquetes versionados                           | Definir vigencias, prestaciones incluidas e historial, sin sobrescribir acuerdos anteriores ni atribuir todo un paquete a cada taller.                                                                                         |
| 3     | Promociones y descuentos contratados                             | Dependen de tarifas/planes versionados; definir condiciones, vigencia y contratación histórica.                                                                                                                                |
| 4     | Eventos especiales                                               | **Módulo operativo 10.2 publicado**, con cobros, gastos y consulta MCP; sigue pendiente cualquier ampliación predictiva no aprobada. No inferir asistencia real desde inscripciones ni declarar probada una escritura productiva.                                                                              |
| 5     | Campañas publicitarias                                           | Inversión, fechas, canales y resultados medibles; definir atribución y vínculo con promociones/eventos. El registro actual de gastos no aporta ese modelo.                                                                     |
| 6     | Clasificación económica de gastos y atribución de costos         | Definir costos directos/compartidos y reglas de reparto, sin duplicar honorarios ni declarar ganancia neta sin modelo aprobado.                                                                                                |
| 7     | Capacidad y recursos por actividad                               | Definir cupos, espacios, horarios y recursos; demanda registrada no equivale a ocupación o asistencia real.                                                                                                                    |
| 8     | Base de Conocimiento Empresarial                                 | **Centro real D022 implementado, versionado, publicado y consultado por MCP** (seis documentos activos en el corte 05–06/11); mejoras adicionales de recuperación, retención o exportación se evalúan independientemente.                          |
| 9     | Simulaciones financieras y comerciales                           | Requieren tarifas, promociones, honorarios dinámicos, costos atribuibles y capacidad definidos; explicitar supuestos, cobertura y riesgos.                                                                                     |
| 10    | Comparaciones históricas ajustadas por IPC                       | Requieren series históricas suficientes, persistencia/serie IPC y metodología de ajuste aprobada; el último IPC disponible no sustituye una serie.                                                                             |
| 11    | Integración segura del asesor IA con fuentes internas y externas | Lectura de indicadores, Know-How real y Eventos conectados mediante API y MCP privado; P0 consultivo aceptado el 06/11; automatización financiera estructurada adicional no implementada. Fuentes externas actuales pueden consultarse por separado, con verificación; conservar identidad, permisos, privacidad y límites. |

Las necesidades empresariales podrán orientar diseños en paralelo sin eliminar dependencias ni ampliar autorizaciones. La evolución anual está publicada; la histórica completa conserva su alcance separado de Prioridad 5. Los documentos empresariales reales del Centro de Conocimiento residen en la instalación del CRM y **no** se sincronizan como contenido privado mediante Git; definir y comprobar respaldos independientes sin confundir versiones de contenido con respaldos restaurables.

## Prioridad 6 — PDF / reportes

Postergado deliberadamente hasta estabilizar los modelos financieros y Estadísticas.

## Pendiente — Análisis histórico completo y modelos adicionales

La vista anual está implementada y publicada en Iteración 11. Permanecen separados el análisis histórico completo con rangos personalizados, las series IPC históricas y los modelos de flujo de caja, utilidad neta y atribución financiera por actividad. Requieren definición y autorización propias; no convierten la vista anual entregada en pendiente. Respetar períodos existentes, cobertura, límites de D021 y suficiencia del historial.
