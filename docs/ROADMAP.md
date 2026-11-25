# PRISMA CRM — Roadmap

## Prioridad vigente — recibos de cobro, después de PWA-4 (25/11/2026)

PWA-4 integrada y desplegada; [estado productivo y fuentes de evidencia](PROJECT_STATE.md).
Issue [#12](https://github.com/hernan-go/prisma-crm/issues/12) completada;
[#13](https://github.com/hernan-go/prisma-crm/issues/13) abierta, diseño V3 y flujo
híbrido aprobados según el propietario. Ampliación de cuentas administrativas descartada.

| Orden | Entrega | Alcance aprobado                                                   |
| ----- | ------- | ------------------------------------------------------------------ |
| 1     | PWA-5A  | Arquitectura de recibos de cobro.                                  |
| 2     | PWA-5B  | Implementación visual V3 e integración con Cobros Período.         |
| 3     | PWA-5C  | Exportación, entrega manual por WhatsApp, aceptación y despliegue. |
| 4     | PWA-6   | Facilitadores.                                                     |
| 5     | PWA-7   | Participantes.                                                     |

Este cierre solo registra el orden aprobado; no inicia estos bloques ni define
contratos técnicos aún no documentados. Portal /app/ continúa deshabilitado;
023 ya aplicada/registrada, sin repetir. Se conservan los requisitos educativos
anteriores y sus observaciones, subordinando su ejecución al nuevo orden.

## Antecedente — cierre administrativo PWA-3B.3 (25/11/2026)

PWA-3B.2 aceptada parcialmente con observaciones; correcciones locales de
navegación, selección de cuenta y foco en [PWA-3B.3](iterations/2026-11-pwa-3b3.md).
Revisión del propietario, integración y despliegue controlado siguen pendientes;
portal y admisiones permanecen cerrados. Siguiente bloque de desarrollo propuesto:
**PWA de facilitadores**, con autenticación y autorización por actividad propias,
sin implementación en esta iteración. Se conservan el MVP educativo y la decisión
recreativa de 3A.5; los siguientes cortes son antecedentes.

## Antecedente — PWA-3A.4 y MVP educativo (24/11/2026)

| Entrega | Alcance y dependencia |
| --- | --- |
| PWA-3A.4 | Reconciliar documentación y auditar estructura, sin funcionalidad nueva. `023.sql` ya fue aplicada y registrada en producción según el propietario; [cierre y límites](iterations/2026-11-pwa-3a-integration-readiness.md#pwa-3a3--cierre-productivo-informado-de-023-24112026). |
| PWA-3B | Revisar el SHA exacto del candidato PWA-2B.1–2B.3, resolver o aceptar observaciones de aceptación administrativa y accesibilidad, integrar y desplegar controladamente con el portal y las admisiones cerrados. CI #102 solo acredita `5a47432`; integración, push manual y despliegue requieren sus decisiones propias. |
| Contenido mínimo | Clases persistentes y ordenadas por `activity_id`, con textos, PDF, guías de actividades, imágenes, audios y videos del encuentro; cuestionarios Multiple Choice sencillos con opciones, corrección y devolución comprensible. Drive conserva los archivos; PRISMA guarda metadatos y referencias. Definir contratos de clase, recurso, orden, evaluación, estado y publicación antes de implementar. |
| Docencia | Facilitadores autorizados editan y publican clases de actividades asignadas, bajo supervisión y bloqueo institucional. Requiere autenticación docente y permisos por actividad separados del piloto. |
| Acceso participante | Activación/autenticación educativa, sesión y rutas protegidas; mostrar solo clases publicadas de actividades con fuente presencial habilitada O derecho digital vigente. Una fuente no afecta otros cursos ni períodos mensuales. Requiere resolver titularidad, recuperación y alternativa accesible de passkeys. |
| Aceptación y activación | Recorrido integral de contenido y cuestionarios, permisos, seguridad, accesibilidad y participante real antes de activar el portal. El MVP **no está terminado** hasta que clases, recursos y cuestionarios sean utilizables por participantes autenticados. |
| Extensiones posteriores | Juegos específicos de facilitadores, analítica pedagógica avanzada, estadísticas de progreso y ejercicios interactivos complejos. |

La persistencia de respuestas, intentos y calificaciones no está aprobada.
[Alternativa recomendada y decisiones abiertas](DECISIONS.md#pwa-3a4--prioridad-educativa-y-decisiones-abiertas-24112026).
[Brechas técnicas](ARCHITECTURE.md#pwa-3a4--contraste-estructural-del-mvp-educativo-24112026).
El orden de las entregas funcionales podrá detallarse en iteraciones aprobadas;
no implica migración numerada ni autorización de implementación.
Los apartados inferiores conservan sus cortes históricos.

## Antecedente — PWA-3 / Etapa 3A — preparación de integración (24/11/2026)

La rama candidata fue publicada en `5a47432` y [CI #102](https://github.com/hernan-go/prisma-crm/actions/runs/45332985401)
aprobó verify y ocho integraciones aisladas. La corrección de eliminación de
actividades pasó sus regresiones. Sigue pendiente aceptación administrativa y de
accesibilidad, preflight/respaldo/recuperación de 023 y autorizaciones separadas
para migración productiva e integración de main. No activar `/app/`.
[Orden y criterios de detención](iterations/2026-11-pwa-3a-integration-readiness.md).
El corte inferior conserva la decisión anterior a la publicación y corrección.

## PWA-2 — preparación de candidato (24/11/2026)

Etapa 1 limitada a auditoría y reconciliación documental local.
[Hallazgos, clasificación de pruebas y condiciones](iterations/2026-11-pwa-2-stage-1.md).
Siguiente decisión: autorizar publicación manual de la rama candidata para CI,
sin integrar main ni activar el portal. Resolver o aceptar expresamente la
observación de borrado de actividades antes de la integración; completar CI,
aceptación administrativa y preparación separada de 023 para el destino.
PWA-1D requiere decisión independiente; PWA-2B.4 no iniciada.

## PWA-2B.3 — administración local y próximo contrato (22/11/2026)

Vínculo participante/persona y habilitación presencial desde inscripción real
implementados localmente. [Evidencia y pendientes](iterations/2026-11-pwa-2b3.md).
Acordar titularidad, activación y principal educativo autenticado antes de acceso
real de participantes. Sin integración/despliegue ni nueva migración.
PWA-2B.4 no iniciada; requiere autorización posterior. Cortes siguientes históricos.

## PWA-2B.2 — administración local; siguiente propuesta (22/11/2026)

Administración digital implementada localmente y documentada en
[el informe 2B.2](iterations/2026-11-pwa-2b2.md); sin integrar ni desplegar.
Proponer PWA-2B.3 para vínculo supervisado del futuro principal educativo y
mantenimiento explícito de fuentes presenciales. Contenido por actividad,
autenticación diferenciada y contrato contable siguen como bloques posteriores.
No iniciar PWA-2B.3 sin autorización nueva. Los cortes siguientes son históricos.

## PWA-2B.1 — fundamento local (22/11/2026)

Implementados servicios internos de vinculación identidad/persona, habilitación
presencial explícita y derechos digitales trimestrales independientes, con
autorización administrativa individual, recibos idempotentes y evaluación OR.
Nueva 023 probada exclusivamente en MySQL descartable; sin integración, despliegue
ni aplicación en bases conservadas. Portal deshabilitado y piloto intacto.
Semántica temporal: UTC-03:00 fijo, tres meses calendario ajustados a fin de mes,
intervalo [inicio,fin); renovación desde max(ahora, fin no revocado).
[Implementación, evidencia y límites](iterations/2026-11-pwa-2b1.md).
PWA-2B.2 requiere autorización nueva; los cortes siguientes conservan su historial.

## Antecedente — prioridad PWA-2A.1 y propuesta PWA-2B (22/11/2026)

PWA-010–019 aprobadas; [reconciliación documental vigente](iterations/2026-11-pwa-2a.md#pwa-2a1--reconciliación-vigente-22112026).
Contenido persistente por actividad, Drive externo, publicación docente autónoma,
gestión centralizada de vínculos y credenciales diferenciadas. No se reabren estas
decisiones. PWA-009 conserva detalles técnicos/rutas propuestos, sin implementar.

[Complemento HOME y comercialización](iterations/2026-11-pwa-2a.md#complemento-final-pwa-018019--home-y-fuentes-de-autorización):
B2 evalúa fuente presencial O digital vigente; B3 incorpora confirmación segura de
compra/habilitación trimestral sin matrículas ficticias; B4 separa muestras públicas
de contenido protegido; B6 muestra todas las disciplinas con ramas de acceso o
presentación comercial y animaciones omitibles. Sin renovación automática ni
promesa de volumen de publicaciones. La integración contable requiere contrato
propio: payments/cuentas mensuales actuales no representan un derecho digital.

Orden propuesto para PWA-2B: (1) fundamentos de identidad y aislamiento del piloto;
(2) vinculación vigente y autorización educativa; (3) administración CRM y acceso
de facilitadores; (4) clases, recursos y moderación; (5) activación/passkeys y
recuperación de participantes; (6) experiencia responsive y aceptación real +50.
Probar compatibilidad WebAuthn en un corte temprano aislado antes de comprometer
la entrega, sin depender de la publicación de contenido. Cada bloque tiene
dependencias y criterios en el informe. **No iniciar sin autorización posterior.**

022 y sellado siguen completados; portal deshabilitado, admisiones cerradas.
Activar el piloto institucional es una operación separada; no habilita terceros.
No quedan como requisitos del MVP almacenamiento binario en SiteGround, Google
obligatorio para participantes ni edición exclusivamente administrativa.

## Antecedente — PWA-2A y preparación de PWA-2B (21/11/2026)

022, despliegue y sellado institucional completados según el propietario;
portal deshabilitado y admisiones cerradas. [Estado acreditado](PROJECT_STATE.md).
Integración PWA-1C y sellado ya no son tareas pendientes.

PWA-2A deja [activación controlada y arquitectura educativa](iterations/2026-11-pwa-2a.md)
listas para revisión documental. PWA-008 es la prioridad funcional aprobada:
clases/materiales para participantes, inicialmente Inclusión Digital +50.
PWA-009 (modelo técnico y rutas) requiere aprobación; no consta implementada.

Próximo bloque propuesto PWA-2B: contratos de acceso de participantes y vínculo
identidad/persona, con pruebas sintéticas y regresión del piloto; después contenido,
archivos privados y navegación. Requiere aprobar las decisiones del informe y
autorizar implementación. Activar el piloto existente es una operación separada,
manual y aún no autorizada; no habilita participantes. No repetir baterías históricas.

## Antecedente — preparación de integración PWA-1C (20/11/2026)

PWA-1B.2 integrada y desplegada en `dfebe3df`, con CI #85 8/8, build productivo 0
y comprobaciones CRM/portal cerrado comunicadas por el propietario.
[Cierre y alcance](iterations/2026-11-pwa-1b2.md). Autenticación preparada;
portal productivo desactivado, sin funciones de negocio PWA ni identidades reales activadas.

PWA-1C implementada y validada localmente: vinculación Google CRM A/B, H2 con
conservación de admin, dos pares sellados, mantenimiento y activación exclusivamente
descartable en revisión 2. Primer login PWA de A y logout persistente comprobados.
**Sin commits de PWA-1C, integración ni despliegue.** Siguiente: revisar el cierre
documental y autorizar por separado la preparación de rama/commits y la integración
CI/CD. CI del futuro SHA pendiente; la CI previa de PWA-1B.2 no la sustituye.

Pendientes reales de aceptación completa: login PWA de B, determinados conflictos
y cancelaciones y expiración efectiva a las ocho horas. La activación productiva,
operaciones sobre identidades reales y mantenimiento del hosting requieren
autorizaciones independientes. Sin funciones nuevas de asistencia, materiales ni
notificaciones. [Evidencia y límites](iterations/2026-11-pwa-1c.md#cierre-técnico-local-y-preparación-de-integración-20112026).
Los avances fechados siguientes son antecedentes; no describen el estado vigente.

## Avance Bloque 5 — 19/11/2026

Logout/mantenimiento implementados y probados localmente: 101 pruebas focalizadas
aprobadas, controles de calidad correctos.
Catorce casos nuevos MySQL acreditados. Bloque 6/H2 pendiente, sin activación ni
publicación. [Evidencia y límites](iterations/2026-11-pwa-1b2.md).

## Validación portal — 19/11/2026

Integración MySQL/InnoDB de Bloques 2–4 acreditada en destino descartable: 38/38,
incluidos los 21 casos anteriormente pendientes. Próximo trabajo: Bloque 5 mediante
autorización independiente; portal desactivado, sin integración Git ni despliegue.
[Evidencia y límites](iterations/2026-11-pwa-1b2.md).

## Avance Bloque 4 — 19/11/2026

Sesiones, guard y finalización OAuth portal implementados y probados localmente. Sin publicación
ni activación. Total de casos MySQL nuevos pendientes de Bloques 2–4: 21.
Logout completo/mantenimiento pertenecen al Bloque 5, todavía pendiente.
[Informe](iterations/2026-11-pwa-1b2.md).

## Avance PWA-1B.2 — 19/11/2026

Bloque 3 de hooks implementado y probado localmente sin MySQL; integración real
de Bloques 2–3 pendiente. Bloque 4 (guard/sesión/finish) requiere autorización
posterior. Bloques 4–6 pendientes; portal cerrado. Sin commits ni despliegue.
[Estado y límites](iterations/2026-11-pwa-1b2.md).

## Avance PWA-1B.2 — 18/11/2026

Bloque 1 de composición y contratos HTTP implementado y probado localmente.
Bloque 2 (store/núcleo OIDC) implementado y probado localmente sin MySQL;
integración MySQL pendiente. Sin commit, integración, despliegue ni activación.
Supera la referencia inferior a PWA-1B.2 sin iniciar para estos dos bloques.
Próximo: Bloque 3, hooks transaccionales, sujeto a autorización. Bloques 3–6 pendientes; roles
reales, sellado y activación en PWA-1C. [Informe](iterations/2026-11-pwa-1b2.md).

## Resumen histórico — 13/11/2026

Estadísticas v2 mensual y anual publicada y aceptada; P0 aceptado en su alcance empresarial consultivo, con issue #2 cerrada el 06/11/2026 según confirmación del propietario. MCP privado versión 6, Know-How real/propuestas y Eventos operativos. [Estado productivo y límites](PROJECT_STATE.md).

Se conserva el orden aprobado de las iniciativas generales. Google Login fue aceptado en producción el 13/11/2026. Permanecen pendientes ayuda contextual y recorridos guiados, informes PDF y los controles de seguridad, recuperación y resiliencia aún no verificados. Actualización PWA del 19/11/2026: PWA-1B.1 y PWA-1B.2 desplegadas, 021 aplicada; portal desactivado y PWA-1C planificada para preparar el piloto supervisado. La PWA de participantes continúa como iniciativa futura. [Estado vigente](PROJECT_STATE.md). Historial completo/rangos, flujo de caja, IPC histórico y modelos financieros avanzados se distinguen de Estadísticas v2 entregada.

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

## Aceptado en producción — Autenticación con Google

Iteración 12.2 cerrada funcionalmente el 13/11/2026 sobre main afd3cce. Push, CI y despliegue SiteGround completados según el propietario, quien confirmó ingreso de ambos administradores en Chrome normal, identidad/Dashboard, logout, protección posterior y rechazo de cuenta no autorizada. Incidencia resuelta. [Evidencia y límites](iterations/2026-11-google-login.md#cierre-productivo-aceptado--13112026).

Alcance vigente:

- Inicio de sesión mediante Google.
- OAuth 2.0 y OpenID Connect.
- Acceso restringido a usuarios expresamente autorizados.
- Verificación segura de identidad y sesiones.
- Convivencia temporal explícita con la contraseña compartida y retirada posterior autorizada.
- Evitar servicios pagos de autenticación cuando exista una implementación directa adecuada sin tarifa adicional.
- Mantener el sistema específico de PRISMA, sin convertirlo en un SaaS multiempresa.

Permanecen pendientes el ensayo completo de recuperación administrativa/revocación manual en producción y controles de seguridad no acreditados. El acceso compartido sigue habilitado por decisión transitoria del propietario, con revisión aproximada diciembre de 2026–enero de 2027, sin retirada automática. [Decisión vigente](DECISIONS.md#decisiones-operativas--google-login-y-builds-siteground-13112026). Google para facilitadores permanece fuera del alcance entregado.

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

La interfaz Estadísticas no requiere por sí sola implementar Google. La autenticación con Google está aceptada en producción desde el 13/11/2026. La conexión MCP, el conocimiento empresarial real y Eventos están publicados. El asesor conversacional puede elaborar escenarios hipotéticos; el alcance P0 consultivo está aceptado; no se implementó un motor financiero estructurado certificado. PDF/reportes conserva su posición posterior.

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
