# PRISMA CRM — Roadmap

**Actualizado:** 2026-10-25

## PRIORIDAD P0 — MÁXIMA: planificación comercial con IA

Etapa 1 autorizada e implementada solo en local: interfaz HTTP mensual de lectura segura para el futuro Site MCP privado, con métricas existentes y acceso empresarial completo aprobado en D024. Se sustituyó la supresión de grupos pequeños; protección personal obligatoria, combinaciones agregadas, gastos con denominaciones controladas y honorarios por actividad/profesional. Contrato independiente del proveedor; IA asesora y decisión humana. Centro de conocimiento privado dentro del sistema y fuentes externas verificables (inflación, ANSES, poder adquisitivo, mercado, calendario/eventos), posteriores. Pendiente de revisión, configuración segura y conexión posterior autorizada. Sin API paga de modelos ni cambios al Site. [Entrega local](iterations/2026-10-ai-read-context.md).

El propietario aprobó la [especificación funcional de planificación comercial con IA](AI_COMMERCIAL_PLANNING.md) como objetivo estratégico principal del desarrollo futuro: una primera carta útil de alternativas comerciales y eventos, con precios concretos, fundamentos económicos y conversación iterativa. Alcance funcional definido y documentado; implementación pendiente.

Esta prioridad reordena la planificación futura y prevalece sobre las secuencias anteriores conservadas como antecedentes. La etapa local de lectura y la corrección D024 cuentan con autorización expresa; no se autorizan despliegue, conexión del Site ni escrituras de datos. D020–D023 conservan cálculos verificables y límites económicos, complementados por el acceso empresarial y la protección personal de D024. La especificación es la referencia funcional única; el know-how privado permanece fuera de Git y tendrá su Centro de conocimiento posterior dentro del sistema.

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

- Segunda entrega de Iteración 9 publicada en `b4b8408`: Cobranzas, refinamientos de seis KPI y acordeones independientes, conservando Gastos, Honorarios e identidad carbón/cian de `ab7e321`. GitHub verificado por Codex; build SiteGround `1792822475-rkhsme`, Exit Code `0` y revisión productiva satisfactoria de octubre/noviembre de 2026 confirmados por el propietario el 24/10/2026. [Cierre productivo](iterations/2026-10-statistics-design.md#cierre-productivo-de-la-segunda-entrega-de-iteración-9--2026-10-24). Los demás bloques siguen pendientes; la Iteración 9 no está finalizada. PRISMA es el emprendimiento cliente, no el nombre genérico del sistema de gestión.
- Skeleton Loaders con Shimmer publicados exclusivamente en Estadísticas en `0568623`, con `react-loading-skeleton@3.5.0` y componentes compartidos reutilizables. El propietario confirmó build `1792863714-2i7gpw`, Exit Code `0` y aparición durante la carga real/desaparición al llegar los datos en producción. [Cierre y límites de validación](iterations/2026-10-statistics-design.md#cierre-productivo-de-skeleton-loaders-en-estadísticas--2026-10-24). Extensión a otros módulos pendiente.
- Motor determinista reutilizable; Recharts 3.10.1 y react-is 19.3.0 publicados, con carga diferida de los gráficos.
- Continuidad principal de personas con inscripción en meses consecutivos, diferenciada de membresías y asistencia.
- Honorarios y gastos operativos separados. El propietario confirmó pagos a facilitadores exclusivamente en su módulo; no se presume duplicación efectiva.
- Sin ganancia neta hasta aprobar el modelo contable.

Secuencia de evolución aprobada, con implementación sujeta a autorización por alcance:

1. Fase actual: Gastos por concepto, Honorarios por facilitador y Cobranzas publicados y aprobados en producción. Cobranzas conserva barra aplicado/pendiente de obligaciones definidas, porcentaje sobre base positiva o «No calculable» y créditos/indefinidos/cobertura separados de la pila, con agregados exactos del backend. Skeleton Loaders con Shimmer publicados en Estadísticas; pendientes su extensión a otros módulos e Inscripciones por actividad. Sin implementación de estos pendientes ni autorización acumulativa; completar los primarios mensuales por etapas.
2. Fase posterior: comparaciones anuales y evolución mensual dentro del año, distinguiendo períodos ausentes, abiertos y cobertura incompleta.
3. Fase futura: análisis histórico completo y rangos personalizados, series económicas nominales y ajustadas por IPC cuando existan datos suficientes. La consulta actual del último IPC y su fallback están implementados; persistencia y serie histórica requieren diseño específico.

Mantener como diseños independientes el historial de bajas y motivos opcionales, su alcance y efectos operativos; y los modelos de tarifas, paquetes, promociones, atribución de ingresos, costos y capacidad previos a simulaciones o rentabilidad. Asistencia y eventos no forman parte de la primera entrega.

### Proyecto posterior independiente — integración analítica con IA

D020 registra la doble finalidad de Estadísticas: herramienta visual de gestión e infraestructura analítica para futuras consultas autorizadas de ChatGPT u otros asistentes, compartiendo cálculos backend. No requiere mostrar en pantalla cada métrica consultable. La arquitectura vigente aprobada es API segura de lectura → complemento MCP privado → ChatGPT. Backend local implementado, sin conexión ni despliegue; D024 sustituye la supresión por acceso empresarial completo con protección de datos personales. Autenticación, permisos y trazabilidad obligatorios; desidentificar no garantiza anonimato.

La interfaz Estadísticas no requiere por sí sola implementar Google ni conectar IA. La autenticación con Google sigue pendiente con su alcance y prioridad existentes. No se implementan MCP, conectores ni chatbot en esta etapa. PDF/reportes conserva su posición posterior.

### Completado — Gastos recurrentes e independencia mensual

Catálogo transversal configurable, asociación explícita de históricos y edición del mismo movimiento por ID; presencia y posición propias del período mediante 011. Migraciones 010–011 validadas en prisma_test, activadas en prisma_dev y aplicadas/registradas en producción según confirmación del propietario del 23/10/2026. Conserva adicionales y reglas D004–D007. [Cierre técnico y validación local](iterations/2026-10-recurring-expenses-implementation.md).

El propietario configuró por UI y amplió el catálogo productivo; no es una lista universal de ocho conceptos. Octubre 2026 quedó reclasificado y conciliado, como confirmación con fecha de corte y sin convertir sus importes en parámetros permanentes. Nuevos importes cero requieren definición expresa; históricos múltiples legítimos permanecen en consulta.

Correcciones de importe y desglose de Estadísticas publicados con Iteración 8. La aprobación manual local previa de diciembre de 2026 se conserva con el alcance registrado en el [informe histórico](iterations/2026-10-recurring-period-independence.md); el cierre productivo posterior está en [PROJECT_STATE](PROJECT_STATE.md). No quedan migraciones ni despliegue pendientes de Iteración 8.

### Selección analítica acordada — seis primarios y cinco secundarios opcionales

Clasificación confirmada por el propietario el 23/10/2026. Los seis primarios son el objetivo funcional; no autorizan implementarlos todos ahora. Gastos, Honorarios y Cobranzas están publicados y validados por el propietario, según los cierres del 24/10/2026.

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

Orden de prioridad y dependencias registrado el 23/10/2026; estado de entrega actualizado el 24/10/2026. Complementa las prioridades existentes de autenticación e informes; no las sustituye ni autoriza implementación. Existente: resumen mensual v1, IPC de referencia, desglose y gráficos de Cobranzas, Gastos y Honorarios publicados. Aprobado conceptualmente: D022/D023. Las capacidades siguientes continúan pendientes de diseño y autorización por alcance.

| Orden | Capacidad futura                                                 | Dependencias y límites                                                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Finalización de Estadísticas mensuales                           | Cobranzas y Skeleton Loaders en Estadísticas publicados; pendientes extensión de Skeletons a otros módulos e Inscripciones por actividad. Completar los primarios por etapas, preservando cobertura y precisión.                              |
| 2     | Tarifas, planes y paquetes versionados                           | Definir vigencias, prestaciones incluidas e historial, sin sobrescribir acuerdos anteriores ni atribuir todo un paquete a cada taller.                                                                                                        |
| 3     | Promociones y descuentos contratados                             | Dependen de tarifas/planes versionados; definir condiciones, vigencia y contratación histórica.                                                                                                                                               |
| 4     | Eventos especiales                                               | Modelar ingresos, costos, entradas, asistentes y resultados; distinguirlos de actividades periódicas, sin inferir asistencia desde inscripciones.                                                                                             |
| 5     | Campañas publicitarias                                           | Inversión, fechas, canales y resultados medibles; definir atribución y vínculo con promociones/eventos. El registro actual de gastos no aporta ese modelo.                                                                                    |
| 6     | Clasificación económica de gastos y atribución de costos         | Definir costos directos/compartidos y reglas de reparto, sin duplicar honorarios ni declarar ganancia neta sin modelo aprobado.                                                                                                               |
| 7     | Capacidad y recursos por actividad                               | Definir cupos, espacios, horarios y recursos; demanda registrada no equivale a ocupación o asistencia real.                                                                                                                                   |
| 8     | Base de Conocimiento Empresarial                                 | Decisión conceptual D022: documentación privada, permisos, versiones, exportación, recuperación y respaldos; almacenamiento definitivo pendiente. Puede diseñarse sin esperar los modelos económicos.                                         |
| 9     | Simulaciones financieras y comerciales                           | Requieren tarifas, promociones, honorarios dinámicos, costos atribuibles y capacidad definidos; explicitar supuestos, cobertura y riesgos.                                                                                                    |
| 10    | Comparaciones históricas ajustadas por IPC                       | Requieren series históricas suficientes, persistencia/serie IPC y metodología de ajuste aprobada; el último IPC disponible no sustituye una serie.                                                                                            |
| 11    | Integración segura del asesor IA con fuentes internas y externas | D023: combinar indicadores, conocimiento empresarial y contexto externo verificado; requiere identidad, permisos, privacidad, auditoría e interfaces autorizadas inicialmente de lectura. Sin proveedor, protocolo o implementación elegidos. |

Las necesidades empresariales podrán orientar diseños en paralelo sin eliminar dependencias ni ampliar autorizaciones. La evolución anual e histórica conserva la secuencia de Prioridad 5. Los documentos privados locales necesitan respaldos independientes porque Git no los sincroniza; su existencia no implementa la Base de Conocimiento ni conecta una IA.

## Prioridad 6 — PDF / reportes

Postergado deliberadamente hasta estabilizar los modelos financieros y Estadísticas.

## Pendiente — Estadísticas anuales e históricas

La secuencia temporal está definida en Prioridad 5. La vista mensual seguirá siendo la principal; las vistas anual e histórica deberán respetar períodos existentes, cobertura y suficiencia de series IPC. Resultados económicos y rentabilidad solo se incorporarán después de completar y aprobar las reglas contables y las limitaciones de honorarios de D021.

Recharts ya está incorporado; su utilización para series anuales/históricas requiere diseño específico. Queda pendiente decidir entre un desplegable «Evolución histórica» o su integración en la categoría de evolución económica. Es exclusivamente un pendiente: no hay consultas históricas, filtros anuales, gráficos ni cambios DB implementados para esta ampliación.
