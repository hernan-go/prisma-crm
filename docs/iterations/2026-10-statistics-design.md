# Iteración 8 — Diseño funcional de Estadísticas

**Diseño original:** 2026-10-22. **Actualización documental:** 2026-10-24. **Estado vigente:** primera entrega de Iteración 9 publicada en `ab7e321`, con Gastos, Honorarios por facilitador e identidad global aprobada. Cierre productivo confirmado por el propietario; no verificado independientemente por Codex. Los otros seis bloques siguen sin implementar. El cierre y la propuesta de Cobranzas al final de este documento prevalecen sobre los estados históricos siguientes.

PRISMA es el emprendimiento de la primera instalación, no el nombre genérico del software. Este documento distingue acuerdos funcionales, hechos del modelo y propuestas técnicas; el registro de Etapa 1 al final identifica la implementación local.

## Ampliación documental de Iteración 9 — alcance vigente

[D020](../DECISIONS.md#d020--doble-finalidad-de-estadísticas-y-capa-analítica-compartida) registra la doble finalidad: gestión visual y capa analítica reutilizable para futuras consultas autorizadas con IA. [ARCHITECTURE](../ARCHITECTURE.md#estadísticas--v1-publicada-y-capa-analítica-compartida) define backend como fuente de cálculo, metadatos de métricas y límites de acceso. La integración externa no está implementada ni autorizada; API, exportación y MCP son posibilidades por diseñar, sin mecanismo elegido. El eventual detalle desidentificado requiere controles propios: desidentificar no garantiza anonimato.

La secuencia aprobada es mensual por período seleccionado → anual con evolución de sus meses → histórica con rangos personalizados y ajustes IPC cuando los datos sean suficientes; detalle en [ROADMAP](../ROADMAP.md#prioridad-5--estadísticas). Gastos y Honorarios están publicados; las próximas prioridades son Cobranzas e Inscripciones por actividad, sin implementación autorizada por este documento. No incorporar ahora cálculos de resultado económico, tarifas, paquetes, promociones, asistencia ni simulaciones sin definiciones y autorizaciones adicionales. D021 amplía la regla de honorarios mayoritariamente fijos respecto de participantes, renegociables y variables por prestación/período. D022/D023 conservan su alcance conceptual de conocimiento empresarial e IA.

Los apartados originales preservan la cronología del diseño y sus autorizaciones parciales. Las menciones a shell, revisión/integración/producción pendientes, IPC futuro o próxima migración 010 describen etapas anteriores, superadas para lo entregado por los cierres productivos del 23/10 y 24/10 en [PROJECT_STATE](../PROJECT_STATE.md). Las referencias a Recharts sin instalar y los diseños visuales anteriores son antecedentes, sustituidos únicamente para la entrega cerrada al final. No son instrucciones para repetir migraciones, verificaciones o despliegues; próxima numeración disponible: `012.sql`. Las propuestas no entregadas conservan su condición pendiente.

## Diseño visual, experiencia de usuario y presentación profesional

Premisa aprobada para Iteración 9, complementaria de D020: utilidad analítica, excelencia visual/experiencia de usuario y preparación para IA son inseparables. La información debe ser confiable, comprensible y relevante para decisiones administrativas, económicas y comerciales; la interfaz moderna, elegante, atractiva, intuitiva y agradable de explorar; y las métricas estructuradas y reutilizables independientemente de la presentación. Ninguna dimensión debe perjudicar a las demás ni convertir la consulta en una montaña de números.

La aspiración estética es comparable a dashboards profesionales modernos exhibidos en plataformas como Behance, adaptada a una aplicación administrativa real: datos auténticos, interacción funcional y comportamiento responsive. Es una referencia de calidad, no una selección actual de diseños externos. Respetar la identidad visual existente mediante una evolución consistente y una dirección común para los siete acordeones.

Antes de implementar gráficos, la etapa funcional correspondiente definirá criterios reutilizables para tipos de gráficos y usos, paleta y significado de colores, tarjetas/contenedores, tipografía/jerarquía, ejes/etiquetas/unidades/leyendas, tooltips/interacciones, animaciones/transiciones, estados vacíos/parciales/de error y presentación responsive/accesible. Esta actualización registra la exigencia, sin diseñar ahora todo el sistema visual ni producir imágenes, mockups o prototipos.

### Criterios de aceptación de futuras entregas

- Cada gráfico debe justificar su presencia por el valor de la información que comunica y responder una pregunta de negocio. Elegirlo por claridad y utilidad; no por disponibilidad en Recharts ni asignando arbitrariamente un tipo distinto a cada indicador. Aprovechar bien los componentes adecuados, sin intentar utilizar toda la biblioteca.
- La calidad estética forma parte de la aceptación desde el diseño, no de un pulido final opcional. Usar jerarquía visual, tipografía, espacios, agrupaciones y contrastes; evitar saturación de colores, métricas, porcentajes, leyendas y decoración. No distorsionar escalas, proporciones ni magnitudes para lograr efectos visuales.
- Mantener gráficos modernos, atractivos y fáciles de interpretar, con tarjetas, colores semánticos, ejes, unidades, leyendas, tooltips e interacciones cuidados y consistentes entre los siete bloques y con el resto del sistema. Evitar información redundante entre gráficos, tablas y KPIs; conservar la alternativa tabular accesible ya exigida, sin repetirla innecesariamente en la vista inicial.
- Garantizar experiencia adecuada en escritorio, tablet y móvil; navegación por teclado, foco visible, contraste suficiente e información esencial accesible sin depender solo de color, hover o animación. Usar animaciones y transiciones únicamente cuando mejoren la experiencia sin perjudicar comprensión, rendimiento ni accesibilidad, respetando movimiento reducido.
- Comunicar estados vacíos, cobertura parcial y errores con claridad y coherencia visual. La estética nunca debe ocultar incertidumbre ni sacrificar precisión, claridad o funcionalidad por una captura atractiva. Mantener los criterios analíticos y de privacidad de D020/D021.

### Valor profesional y demostraciones públicas

Estadísticas también podrá demostrar la calidad real del software en LinkedIn, portfolio, presentaciones comerciales y demostraciones a potenciales clientes. Su calidad estética no es secundaria; debe surgir de un producto útil y funcional, sin elementos puramente publicitarios dentro del módulo ni pantallas artificiales preparadas solo para publicidad. Las particularidades de PRISMA no se convierten en requisitos universales.

Para demostraciones públicas, utilizar información sintética identificada como tal o adecuadamente anonimizada y autorizada, sin exponer datos personales ni información económica privada. No fabricar indicadores o cifras aparentando que provienen de operaciones reales. D020 conserva la advertencia de que desidentificar no garantiza anonimato; el eventual uso de datos reales requiere evaluar esa protección y su autorización.

## Alcance del cierre documental anterior

Exclusivamente documentación local. No modificar código, instalar dependencias, ejecutar tests, iniciar servicios, operar bases, crear migraciones o commits, hacer push ni desplegar. El diagnóstico y las propuestas futuras no autorizan desarrollo. Esperar revisión y autorización expresa después de presentar el diff.

Base comprobada: `main` limpio en `dcee416e7a45cc756e5e5fff59e6de2166fb6d63`, un commit documental por delante de la referencia local `origin/main` en `06f3d1f`. Se creó `codex/iteration-8-statistics-design` desde ese HEAD, sin mover `main`, perder el commit ni sincronizar el remoto. La escritura del índice para crear la rama requirió permiso fuera del sandbox. No se verificó GitHub ni producción en esta intervención.

Lecturas de referencia: PROJECT_STATE, WORKFLOW, cierre de iteración 7, DECISIONS, ROADMAP, ARCHITECTURE y diagnóstico previo de esta conversación. En aquel cierre, `/estadisticas` contenía solo el título. La Etapa 1 posterior se registra al final; no crea tablas.

## Acuerdos funcionales aprobados

- Resumen ejecutivo inicial limpio y prioritariamente económico; no llenar la vista inicial de gráficos.
- Siete categorías en acordeones, con una sola abierta por vez.
- Recharts como primera opción gráfica, pendiente de instalación y validación posterior.
- Motor determinista reutilizable con precisión monetaria decimal.
- Importes parcialmente conocidos como subtotales, con advertencias y cantidades de casos pendientes de definición.
- Continuidad principal sobre personas únicas inscriptas en períodos mensuales consecutivos; distinguirla de membresías, asistencia y bajas registradas.
- Sin cifra de ganancia neta hasta aprobar el modelo contable. No presentar diferencias parciales como beneficio.

### Resumen y navegación

El resumen del período seleccionado contemplará importe a cobrar definido, cobrado, deuda conocida, honorarios comprometidos/pagados/pendientes y gastos operativos registrados. Los créditos se informan aparte. Incluir los últimos indicadores oficiales de inflación con su mes de referencia y fecha de publicación cuando se implemente la integración; mientras tanto, no inventar ni proyectar un dato oficial.

Identificar período abierto/cerrado y cobertura. Cuando el importe total sea desconocido, mostrar claramente el subtotal conocido, incluso si es cero, sin afirmar completitud. Cero, NULL, ausencia de registros y fallo de consulta son estados distintos.

Categorías acordadas:

1. Ingresos y cobranzas.
2. Gastos operativos, servicios e impuestos.
3. Facilitadores y honorarios.
4. Participantes, actividades e inscripciones.
5. Continuidad, retención y bajas.
6. Inflación y evolución económica.
7. Tarifas, promociones y simulaciones comerciales.

Cada gráfico incluirá explicación de significado, período/eje temporal y limitaciones, además de una alternativa tabular accesible. Diseño responsive, teclado, foco visible, toque y reducción de movimiento. Una categoría pendiente no debe mostrar gráficos o datos ficticios.

Como propuesta de presentación, no decisión adicional de negocio: seis tarjetas agrupando los tres importes de honorarios en una; filtros dentro de cada categoría; todos los acordeones cerrados al entrar; carga de gráficos al abrirlos. La composición final y los valores por defecto se revisarán en la implementación.

## Dominios y reglas económicas

**Confirmación del propietario:** los pagos a facilitadores de PRISMA se registran exclusivamente en Pago Facilitadores, no en Gastos. Este dato sustituye la incertidumbre del diagnóstico previo; no es una nueva consulta productiva. No asumir doble carga efectiva sin evidencia. Honorarios y gastos operativos serán dominios diferenciados; conservar controles para prevenir futuras dobles imputaciones sin cambiar la registración actual.

- Honorarios fijos por prestación pactada, variables entre facilitadores, actividades y períodos; sin porcentajes automáticos sobre ingresos.
- Período económico de la cuenta/oferta, fecha del cobro/pago y timestamp de registro son ejes distintos. Los cobros y pagos a facilitadores pueden tener fecha fuera del período económico; Gastos exige fecha dentro del período seleccionado.
- `amount_due=NULL` es indefinido; cero es un importe definido. Deudas y créditos por cuenta se suman separadamente, sin compensar personas ni trasladar saldos automáticamente entre meses.
- Gastos registrados no significa gastos efectivamente pagados. No hay estado estructurado de pago ni vencimiento de esos gastos.
- No adjudicar el importe completo de un paquete a cada taller. Atribución de ingresos, costos compartidos y resultado económico siguen pendientes.
- No crear períodos desde consultas, fuentes externas, importaciones ni reorganizaciones de Gastos. Closed conserva lectura y bloquea escrituras hasta reapertura explícita.

## Indicadores v1 y fuentes actuales

Alcance funcional para una futura v1, no código autorizado. `D` es importe a cobrar y `P` suma de cobros de una cuenta; `H` es compromiso de honorario y `F` suma de pagos de ese compromiso. Fórmulas con D/H definidos excluyen indefinidos del subtotal y los informan en cobertura.

| Indicador                       | Fórmula/fuente                                                                         | Eje y límite                                                                                                | Presentación prevista                          |
| ------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| A cobrar definido               | Suma D definidos; monthly_accounts                                                     | Período de cuenta; incluir en advertencia miembros sin cuenta y cuentas NULL                                | Subtotal y cobertura                           |
| Cobrado del período             | Suma payments asociados a cuentas del período                                          | Período económico; no caja por mes de fecha                                                                 | Tarjeta y distribución                         |
| Deuda conocida                  | Suma max(D-P,0) con D definido                                                         | Período de cuenta; no estimar indefinidos                                                                   | Subtotal/tabla                                 |
| Crédito                         | Suma max(P-D,0) con D definido                                                         | Período de cuenta; no compensa deuda ajena                                                                  | Valor separado                                 |
| Cobertura de importes           | (Miembros con cuenta definida / miembros) × 100; period_memberships y monthly_accounts | Cero cuenta como definido; denominador cero es no aplicable                                                 | Cantidades y porcentaje                        |
| Cobros por medio/receptor       | Suma payments agrupados por method/recipient                                           | Período de cuenta por defecto; si se consulta por fecha, declararlo                                         | Barras y tabla; no saldo de cartera disponible |
| Honorarios comprometidos        | Suma H definidos; facilitator_accounts y pares oferta/facilitador asignados            | Período de oferta; incluir pares sin cuenta en cobertura, sin multiplicar por horarios                      | Subtotal con cobertura                         |
| Honorarios pagados              | Suma facilitator_payments                                                              | Período de oferta; fecha del movimiento como análisis separado                                              | Tarjeta/tabla                                  |
| Honorarios pendientes           | Suma max(H-F,0) con H definido                                                         | No convertir H NULL en cero; detectar pagos superiores al compromiso                                        | Subtotal y advertencia                         |
| Gastos registrados              | Suma period_expenses mediante categorías del período                                   | No acredita pago; no sumar nuevamente respaldo advertising_investments                                      | Total y categorías                             |
| Personas del período            | Cantidad de period_memberships                                                         | Pertenencia explícita, con o sin actividades                                                                | Tarjeta secundaria                             |
| Personas con actividades        | Personas distintas en enrollments                                                      | No asistencia; conservar historia de personas archivadas                                                    | Tarjeta secundaria                             |
| Inscripciones                   | Cantidad de enrollments                                                                | Una persona puede tener varias; varios slots no suman inscripciones                                         | Tarjeta y barras por actividad                 |
| Inscriptos por actividad/bloque | Personas distintas por oferta/schedule; enrollments y enrollment_slots                 | No ocupación real ni porcentaje de cupo grupal                                                              | Barras/tabla                                   |
| Continuidad principal           | (Personas únicas inscriptas en A y B / personas únicas inscriptas en A) × 100          | A y B meses calendario consecutivos; sin personas en A o sin alguno de los períodos existente no calculable | Cantidades y porcentaje                        |
| Sin inscripción posterior       | Personas inscriptas en A que no figuran en B                                           | Mismo par consecutivo; no llamar abandono ni baja efectiva                                                  | Comparación descriptiva                        |
| Variación nominal               | (Xb/Xa-1) × 100                                                                        | Misma métrica/eje; base cero o faltante no calculable                                                       | Comparación y serie                            |

Para continuidad, deduplicar por persona, sin exigir conservar la misma actividad; cambios de taller no son bajas generales. La continuidad por membresía es un análisis distinto. Períodos abiertos hacen provisional el resultado; un período inexistente no se reemplaza silenciosamente por el anterior disponible. Un período existente sin inscripciones representa cero registros actuales, no prueba que la carga esté completa. Las reglas finales de filtros y advertencias requieren revisión.

No se incorpora como decisión definitiva el porcentaje de «obligación cubierta» propuesto en el diagnóstico. Nombre, fórmula, denominador y eventual inclusión se mantienen pendientes; evitar llamar efectividad de cobranza al cociente simple cobrado/a cobrar cuando existen créditos o importes indefinidos.

### Limitaciones de datos

- El Dashboard actual cuenta cuentas NULL pero no miembros sin cuenta; el futuro motor debe cubrir ambos sin cambiar ahora sus métricas.
- Facilitadores se resuelve por oferta/horarios/asignaciones, no por activities.instructor_id legado. Las cuentas persistidas sin asignación actual también integran su universo.
- La edición del compromiso de honorarios puede dejar pagos previos superiores; pendiente cero no describe esa diferencia. No inventar un crédito de facilitador.
- No se conserva un historial completo de cancelaciones, cambios de importe ni motivos de baja; no reconstruirlo desde timestamps. Los backfills de migraciones no acreditan fecha original de incorporación.
- No existe asistencia por clase ni cupo grupal configurable. Reservas individuales no acreditan presencia.
- Períodos cerrados pueden reabrirse: el estado persistente actual no es un snapshot inmutable de lo informado anteriormente.
- Categorías de gastos pertenecen a cada período; sus nombres/IDs no constituyen todavía una clasificación comparable entre meses.
- No hay tarifas, paquetes contratados, reglas de atribución o clasificación de costos suficientes para rentabilidad por taller.

## Propuesta técnica para desarrollo posterior

Separar consultas/agregaciones, cálculos puros, contratos y presentación. Reutilizar Decimal.js y MySQL DECIMAL(12,2) para dinero; transportar importes exactos como strings, usar conversión numérica solo para geometría gráfica y mantener valores exactos en tablas/tooltips. Evitar duplicar importes al unir cuentas, pagos, slots y asignaciones. Definir lectura consistente del resumen sin usar el bloqueo global de escrituras de personas para estadísticas.

Contrato propuesto: valor/subtotal conocido, estado de cobertura, universo y casos indefinidos, período y eje temporal, filtros, fuente y fecha de consulta, versión de definición. API agregada autenticada con el esquema existente, sin fichas personales innecesarias; nombres/rutas/archivos finales pendientes. Google no es requisito técnico para consultar Estadísticas internamente; su desarrollo mantiene el alcance y prioridad ya aprobados.

Recharts sigue sin instalarse. La evaluación previa identificó compatibilidad declarada de una versión estable 3.x con React 19; versión exacta, react-is, licencia/avisos, compatibilidad real y tamaño del bundle deberán verificarse al autorizar dependencias. Tomar patrones de composición de shadcn/ui sin introducir por defecto otro sistema completo de interfaz. Reutilizar tarjetas/estilos, selector global, estados de carga/error y TanStack Query. Montar gráficos visibles, preservar claves por período/filtros y no mostrar respuestas tardías bajo otro período.

No implementar MCP, conectores, chatbot ni multitenancy. El motor reutilizable no equivale a autorización externa: privacidad, desidentificación, identidad y scopes de una conexión futura necesitan diseño independiente.

## IPC oficial — integración futura pendiente

Contemplar variación mensual, acumulada del año e interanual. Cada dato debe identificar mes de referencia, serie/región/base, fuente y fecha de publicación; distinguir fecha de recuperación. No anticipar octubre con un dato de septiembre ni mostrar proyecciones como oficiales.

Propuesta pendiente de aprobación técnica: IPC nacional nivel general, adaptador backend a fuente estructurada oficial, caché y persistencia verificable, actualización idempotente tras publicación, conservación de último dato válido y alternativa manual contrastada con fuente oficial. Confirmar formato, condiciones del proveedor y mecanismo de persistencia antes de diseñar una migración. No bloquear finanzas por una falla externa.

Fórmulas conceptuales: mensual = `(I[t]/I[t-1] - 1) × 100`; acumulada = `(I[t]/I[diciembre_anterior] - 1) × 100`; interanual = `(I[t]/I[t-12] - 1) × 100`. No sumar porcentajes mensuales. Para X de un mes, precios de base = `X × I[base]/I[mes]`; variación real = `((Xb/Xa)/(Ib/Ia)-1) × 100`. Exigir índices compatibles y cubrir meses ausentes; ajustar cada mes antes de sumar varios. No equiparar IPC con variación exacta de costos del negocio.

Referencias para verificar en la etapa técnica: [IPC INDEC](https://www.indec.gob.ar/Nivel4/Tema/3/5/31), [metadatos](https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_metadatos.txt), [catálogo API-INDEC](https://api.indec.gob.ar/ayuda/faq). No se promete aquí un endpoint público específico ni se congela un valor de inflación como vigente indefinidamente.

## Bajas y recomendaciones comerciales — etapas posteriores

Propuesta de registro desde perfil: distinguir baja de actividad y del vínculo general, fecha efectiva y fecha de registro, motivo opcional y reingreso. Motivos preliminares: económico, incompatibilidad de horarios, razones personales, convivencia/dinámica grupal, insatisfacción con actividad, cambio de intereses, otro y no informado. No reconstruir motivos históricos; preservar cuentas, pagos e inscripciones anteriores. Efectos sobre operaciones vigentes, archivo, correcciones en períodos cerrados y atribución de autor con contraseña compartida están pendientes.

Antes de simulaciones: tarifas versionadas con vigencia, condiciones de paquetes, contratación individual, bonificaciones, atribución de ingresos, costos fijos/variables y compartidos, capacidad y prestación pactada. No recomendar precios definitivos, aumentos de honorarios o discontinuaciones como conclusiones sustentadas si faltan esos datos. Punto de equilibrio y contribución por taller requieren ese diseño; no son indicadores implementados ni ganancia neta aprobada.

## Tarea diferenciada — Gastos recurrentes y adicionales

**Alcance funcional solicitado:** sección superior de conceptos recurrentes; debajo gastos adicionales. Para PRISMA, recurrentes: alquiler, expensas, electricidad, gas, internet, agua cuando corresponda, impuestos y tasas. Adicionales: publicidad, insumos, librería, alimentos, limpieza, mantenimiento, equipamiento y otros conceptos.

Recurrente no equivale a importe fijo ni a pagado. Los importes son propios de cada período; actualizaciones no sobrescriben históricos. Honorarios permanecen en su dominio, conforme a la confirmación del propietario.

Trabajo de diseño requerido antes de implementar:

1. Revisar categorías y movimientos existentes con alcance de lectura expresamente autorizado, sin asumir que conceptos ausentes deban crearse.
2. Evaluar reutilización y agrupación sin duplicar categorías, recrear movimientos ni perder IDs, importes, fechas y referencias históricas. No clasificar automáticamente por palabras sin revisión.
3. Definir configuración por instalación y correspondencias comparables entre períodos; las necesidades de PRISMA no son categorías obligatorias para otros clientes.
4. Resolver organización visual, aplicabilidad opcional, orden, persistencia y eventual migración. Mantener D006: no se aprueban categorías automáticas ni copia automática de importes; cualquier cambio de esa regla necesita decisión expresa.
5. Preservar aislamiento mensual, fecha exacta del gasto, bloqueo de cerrado y períodos explícitos. La reorganización por sí sola no altera totales.
6. Coordinar su contrato de clasificación con Estadísticas y controles preventivos de doble imputación. No cambiar el mecanismo actual de registración ni asumir duplicación histórica.

Actualización posterior del alcance G: catálogo transversal y marcador canónico aprobados e implementados localmente; 010 validada en prisma_test y aplicada controladamente en prisma_dev con autorización posterior. Se mantienen categorías bajo demanda, importes propios por período y clonación sin gastos. No cambian las fórmulas de este resumen. [Cierre técnico de recurrentes](2026-10-recurring-expenses-implementation.md); Catálogo PRISMA todavía sin configurar en prisma_dev; producción pendiente de autorización independiente.

## Plan incremental propuesto

Cada etapa exige autorización de implementación; este documento no concede una autorización acumulativa.

| Etapa | Entregable y dependencias                                                       | Archivos previsibles, no creados por este plan                                                                 | DB y validación futura                                                                                  |
| ----- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1     | Contratos y resumen con indicadores actuales/cobertura                          | client/Statistics.tsx, App.tsx y estilos acotados; shared/statistics.ts, server/statistics/ y montaje de rutas | Sin migración prevista; fórmulas, aislamiento, consistencia y reconciliación                            |
| 2     | Siete acordeones, gráficos disponibles, comparaciones y continuidad descriptiva | client/statistics/, package.json y lockfile; consultas agregadas                                               | Sin migración prevista; compatibilidad/bundle, teclado, touch, responsive y respuestas tardías          |
| G     | Reorganización de Gastos como tarea independiente coordinada                    | client/Expenses.tsx, server/expenses.ts, shared/expenses.ts y contratos analíticos según diseño                | Migración solo si el diseño la exige; preservación de registros/totales y configuración por instalación |
| 3     | IPC oficial; confirmar fuente, caché y persistencia                             | server/inflation/, contrato shared y sección de Estadísticas                                                   | Eventual migración; parser, actualización, errores, publicación, revisión e índices faltantes           |
| 4     | Historial de bajas por actividad/vínculo, desde perfil                          | client/People.tsx, módulos backend/shared y sección analítica                                                  | Nueva estructura/migración a diseñar; preservación, rectificación y reingreso                           |
| 5     | Tarifas, paquetes, costos/capacidad y luego escenarios                          | Dominio comercial, Gastos y motor/UI según alcance                                                             | Nuevas estructuras a diseñar antes de rentabilidad o simuladores                                        |

G puede planificarse en paralelo conceptual con el motor, pero no se autoriza desarrollo paralelo ni se altera la prioridad de Google/PDF. Las categorías futuras se muestran con su limitación; no simuladores ficticios. La próxima numeración disponible sigue siendo 010; no reservar números por etapa ni editar 001–009.

Actualizar durante cada implementación únicamente PROJECT_STATE, ROADMAP, este documento y DECISIONS/ARCHITECTURE si cambian reglas o diseño técnico. No modificar documentos históricos para aparentar que funciones futuras ya existen.

## Criterios de aceptación y pruebas futuras

- Resumen reconciliable con Cobros, Pago Facilitadores, Gastos y fórmulas del Dashboard, explicando diferencias de cobertura sin cambiar ahora esos módulos.
- Casos NULL/cero/sin cuenta, pagos parciales, sobrepagos, pagos fuera del mes, importes altos y aritmética decimal; sin multiplicar por joins ni compensar personas.
- Facilitadores con varios horarios, cuentas sin asignación actual, pares sin cuenta e importe reducido después de pagar.
- Personas únicas frente a varias actividades/slots, archivados históricos, continuidad de meses consecutivos y período ausente/abierto/vacío.
- Sin creación de períodos ni escrituras analíticas; aislamiento, consultas autenticadas, errores parciales y respuestas tardías.
- Una sola categoría abierta, explicación y tabla por gráfico, foco/teclado/touch, reducción de movimiento y QA en mobile 390/700, límite 701, tablet y desktop.
- En etapas correspondientes: IPC con mes no publicado/fuente caída/corrección; Gastos con importes variables e históricos intactos; bajas sin pérdida de datos financieros.

Al implementar, seguir validación estándar de WORKFLOW y limitar integración/destrucción exclusivamente a prisma_test. En este cierre documental no se ejecutan tests, typecheck, lint ni build; solo revisión documental, enlaces locales, diff y comprobación de alcance.

## Decisiones y autorizaciones pendientes

- Revisión de la implementación local de Etapa 1; autorización independiente para etapas posteriores.
- Contratos finales, filtros, composición visual, comparación nominal predeterminada y detalle de advertencias; la base principal de continuidad ya está aprobada.
- Eventual porcentaje de obligación cubierta y definición contable del resultado económico.
- Serie/región IPC, mecanismo oficial de consulta, persistencia y procedimiento de correcciones.
- Diseño de Gastos: reutilización/clasificación, configuración por instalación, esquema y tratamiento de históricos, sin categorías automáticas aprobadas.
- Efectos operativos y correcciones del registro de bajas; alcance final de motivos y protección de texto libre.
- Tarifas/paquetes, atribución de ingresos y costos, capacidad y criterios comerciales previos a simulación.

No quedan por redecidir el resumen económico, los siete acordeones exclusivos, Recharts como primera opción, el motor determinista, los subtotales con cobertura, la continuidad principal ni la separación confirmada de honorarios/Gastos. La autorización posterior abarca únicamente la Etapa 1 descrita a continuación.

## Etapa 1 — Implementación local autorizada posteriormente

Se preservaron los cinco documentos previos mediante copia temporal antes de editar; rama `codex/iteration-8-statistics-design`, HEAD y main en `dcee416`. Sin sincronización remota, commits ni integración.

Implementado: motor puro Decimal, contratos Zod, consulta autenticada `GET /api/statistics/summary?period_id=<id>` y resumen de seis tarjetas. Devuelve versión 1, período/estado, fecha de lectura, ocho métricas con valor exacto, cobertura (`complete`, `partial`, `undefined`, `empty`), universo, definidos, NULL, sin cuenta, eje `economic_period`, fuentes y advertencias; sobrepagos de honorarios separados. IPC usa `pending_integration` y valores/fechas nulos. No devuelve identidades ni fichas.

Fórmulas: a cobrar = suma D definidos; cobrado = suma P de cuentas del período; deuda = suma max(D-P,0) y crédito = suma max(P-D,0) por cuenta definida. Honorarios: suma H definidos, suma F pagados y suma max(H-F,0); diferencia superior = suma max(F-H,0), sin denominarla crédito. Gastos = suma de movimientos vía categorías del período, sin respaldo de publicidad ni honorarios. No se filtra por fecha calendario de cobro/pago ni por archivo de personas/facilitadores.

Lectura parametrizada en una única conexión y snapshot MySQL REPEATABLE READ, READ ONLY; commit o rollback y release incluso ante errores. La unión de asignaciones y cuentas históricas deduplica pares oferta/facilitador; pagos se agregan antes de joins. El motor usa Decimal local con precisión 40 y strings de dos decimales; la UI formatea strings sin Number. Las claves Query y la comprobación del ID recibido evitan mostrar respuestas de otro período. Las tarjetas usan el selector global y distinguen carga, error/reintento, vacío y cobertura incompleta. No se incorporaron acordeones vacíos.

Pruebas añadidas: fórmulas/contratos, API autenticada, snapshot/limpieza ante fallos, renderizado y respuestas tardías. `tests/statistics-db.test.ts` es opt-in independiente: comprueba host local, DB_NAME y SELECT DATABASE() antes de insertar fixtures; prueba joins, pagos fuera del mes, archivados, períodos abiertos/cerrados/vacíos y reconciliación SQL, luego rollback. No ejecuta migraciones. La suite antigua de integración queda deshabilitada porque recrea/migra esquema. Fixture visual sin backend en `tests/browser/statistics.html`.

Validaciones: typecheck, lint, 180 pruebas generales y build aprobados; 158 casos DB omitidos en la suite general. La prueba aislada de Estadísticas pasó adicionalmente en prisma_test, tras verificar configuración local y SELECT DATABASE(); fixtures revertidos. Diff check aprobado. QA visual con datos ficticios: 390/700/701/768/1024/1440 px sin overflow horizontal, selección de período cerrado correcta. Vitest y MySQL requirieron permisos fuera del sandbox; el primer intento de tests falló por EPERM en archivos temporales, sin ejecutar casos. Build emitió solo avisos de anotaciones de Zod. Revisión visual del propietario, integración y producción pendientes. Sin dependencias nuevas ni modificaciones de reglas de Cobros, Dashboard, Gastos o Facilitadores.

Prueba manual: iniciar `.\private\run-dev.ps1`, abrir `http://localhost:5173/estadisticas`, iniciar sesión y elegir períodos abiertos/cerrados. Comparar cobrado/deuda/crédito con Dashboard y Cobros; revisar miembros sin cuenta, honorarios y Gastos. Cambiar rápidamente de período y comprobar título/estado/valores. Para revisar sin datos reales, abrir `/tests/browser/statistics.html` en Vite; comprobar 390/700/701/768/1024/1440 px y navegación de teclado.

Siguiente autorización propuesta: Etapa 2 acotada a siete acordeones exclusivos y gráficos de indicadores disponibles; evaluar versión/peer/licencia/bundle de Recharts, instalar solo tras aprobación y probar accesibilidad, responsive y movimiento reducido. Comparaciones/continuidad requieren contratos y consultas específicos; IPC externo, bajas, Gastos y simuladores siguen separados.

## Refinamiento posterior de Etapa 1 — UI e IPC mínimo autorizado

La revisión del propietario aprobó los cálculos y la actualización de montos; autorizó este refinamiento y una integración mínima de IPC, adelantada respecto del plan original. No autoriza acordeones ni Recharts.

- Seis tiles en una fila con área de contenido >=1300 px; grilla 3x2 intermedia, dos columnas en áreas estrechas y una en mobile pequeño. Tarjetas neutras sin franja superior; importes y subtotales visibles, detalles/cobertura/metodología en Información. Honorarios conserva pagado/pendiente y aviso breve de sobrepago; créditos siguen visibles por separado.
- Encabezado sin repetir descripción, “Resumen ejecutivo” y mes ya presente en el selector global. Estado abierto/cerrado junto a Estadísticas en desktop y mobile. Ayudas reutilizan useDisclosure: botón accesible, Escape, clic exterior, cierre explícito y retorno de foco; ajuste de posición para evitar desbordamiento.
- Nuevo contrato independiente `shared/inflation.ts` y endpoint autenticado `GET /api/statistics/inflation`, independiente del período económico. Se conserva el campo reservado pending_integration del contrato financiero v1 por compatibilidad; el tile consume la consulta independiente. No se modifica el motor de dinero.
- Fuente: página [IPC INDEC](https://www.indec.gob.ar/Nivel4/Tema/3/5/31) y [CSV oficial](https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv). Exclusivamente código 0, región Nacional. Tasas mensual e interanual publicadas; acumulado = (índice del mes / diciembre anterior - 1) x 100 con Decimal, redondeado a un decimal. Fecha y URL del informe desde la primera publicación técnica; exigir publicación en el mes posterior a la referencia y no futura. Rechazar series incompletas, duplicadas, inválidas o anteriores al respaldo; no inventar proyecciones ni sumar tasas mensuales.
- Servicio con URLs oficiales fijas, timeout compartido de 8 segundos, límites de tamaño, sin redirecciones, caché de seis horas y solicitudes concurrentes agrupadas. Ante falla, conserva el último valor verificado y reintenta después de 15 minutos. Respaldo inicial contrastado el 22/10/2026: septiembre de 2026, 1,9 % mensual, 23,6 % acumulado, 33,4 % interanual; publicado el 13/10/2026 en el [informe oficial](https://www.indec.gob.ar/uploads/informesdeprensa/ipc_10_268C45A9444C.pdf). No se presenta como dato del mes seleccionado ni como actualización confirmada si falla la consulta.
- Limitación deliberada: sin DB ni persistencia histórica. Después de reiniciar, si no hay red, solo está disponible el respaldo incluido y debe mostrarse su referencia/fechas y advertencia. Cambios del formato oficial requieren adaptar el parser; las finanzas no dependen de su disponibilidad.

Validaciones del refinamiento: typecheck, lint, 188 pruebas (158 casos DB omitidos), build y diff check aprobados; consulta real al adaptador INDEC aprobada. QA con datos ficticios a 390/700/701/768/1024/1440/1920 px sin scroll horizontal, seis tiles en una fila a 1920 px, todas las ayudas operativas, apertura por teclado, cierre exterior/Escape y retorno de foco comprobados. No se ejecutaron pruebas DB. Prueba manual: ejecutar run-dev.ps1 y abrir /estadisticas; revisar seis columnas en desktop amplio, 3x2 intermedio y mobile; abrir las seis ayudas mediante clic y teclado, cerrar con Escape/exterior y comprobar foco. Cambiar el período y comprobar que el IPC conserva su referencia oficial independiente. El fixture /tests/browser/statistics.html utiliza datos de prueba en memoria y no consulta fuentes externas. Sin migraciones, dependencias nuevas, commits, push, integración ni despliegue.

## Tarea G — Evaluación posterior de Gastos recurrentes

Se recibió autorización condicionada para reorganizar Gastos: si se necesita nueva estructura, presentar la propuesta y esperar aprobación. La inspección identificó la necesidad de persistir conceptos transversales y su vínculo con categorías mensuales. Se preparó el [diseño y DDL propuestos](2026-10-recurring-expenses-design.md), sin implementar esa parte ni crear/ejecutar migraciones. La maqueta de revisión es independiente y no cambia /publicidad. Se preservan motor financiero, IPC, D006, históricos y clonación sin gastos; autorizar el esquema es el siguiente paso antes de desarrollar la reorganización funcional.

### Addendum — Desglose real de Gastos registrados

En la continuación del 2026-10-22 se implementó `GET /api/statistics/expenses?period_id=<id>` y su acción **Ver desglose** dentro de la ayuda del KPI. El backend agrupa por categoría con movimientos en snapshot read-only, separa recurrentes/adicionales por vínculo persistido, usa DECIMAL, muestra conteos y subtotales e incluye total general. El modal compara importe y cantidad contra el KPI para señalar respuestas desactualizadas; no dice que los movimientos estén pagados. Pruebas y limitación visual por autenticación: [cierre de correcciones de Gastos recurrentes](2026-10-recurring-expenses-implementation.md).

## Pendiente — Estadísticas anuales e históricas

La vista mensual seguirá siendo la principal, vinculada al período seleccionado. Se planifica una vista anual seleccionable con evolución de los doce meses y una vista histórica desde el primer período registrado, con rangos personalizados de fechas/años y comparación de ingresos, cobranzas, gastos y honorarios. Deberá cruzar cada mes con su IPC oficial y distinguir evolución nominal de evolución ajustada por inflación. Resultados económicos y rentabilidad solo se incorporarán después de completar y aprobar las reglas contables.

Recharts se evaluará en una etapa posterior. Queda pendiente decidir entre un desplegable «Evolución histórica» o su integración en la categoría de evolución económica. Es exclusivamente un pendiente: no hay consultas históricas, filtros anuales, gráficos ni cambios DB implementados para esta ampliación.

## Cierre local y aprobación manual de Hernán

Hernán confirmó las pruebas manuales satisfactorias en prisma_dev sobre el período diciembre de 2026: importes y conciliación de $860.000, posiciones independientes entre períodos, renumeración, retiro de Luz sin importe, persistencia entre períodos y reincorporación. Esta aprobación corresponde a esos recorridos y no amplía la evidencia manual a eliminación de movimientos con importe, concurrencia, rollback, recuperación o restricciones de integridad: esos casos conservan únicamente la cobertura automatizada/técnica ya registrada.

Cierre Git autorizado en tres commits locales dependientes: migraciones 010–011; implementación integrada de Estadísticas/IPC/Gastos Recurrentes y pruebas; documentación. No se repitieron suites extensas ni auditorías DB durante este cierre porque no hubo cambios funcionales. Fetch de origin realizado antes de los commits: main local dcee416 está un commit documental por delante de origin/main 06f3d1f, sin divergencia inesperada. Main no se modifica. Integración, respaldo/migraciones productivas 010→011 y publicación permanecen pendientes de autorización y ejecución del propietario.

## Iteración 9 — Primer gráfico mensual de Gastos local

Entrega posterior autorizada: un único gráfico horizontal por categoría/concepto en el acordeón de Gastos operativos, servicios e impuestos. Base `3370c45`, rama `codex/iteration-9-expense-chart`; sin commits nuevos, push, merge ni deploy. Los otros seis bloques y cualquier gráfico adicional quedan fuera del alcance. No se modificaron bases, migraciones, endpoints, contratos ni fórmulas económicas del backend.

Consulta existente `/api/statistics/expenses?period_id=…`, validada y compartida con el modal por la misma clave de TanStack Query. Apertura/cierre accesibles; un único estado de bloque abierto, sin placeholders de funcionalidades inexistentes. El módulo con Recharts se importa al abrir. Se conservan los seis KPI y Ver desglose. Cambio de período remonta el panel y exige ID coincidente en la respuesta; no utiliza datos anteriores como placeholder. Ante diferencias de total o cantidad respecto del KPI, advierte y ofrece actualizar ambas lecturas. El contrato no informa completitud de la carga: la interfaz aclara que categorías ausentes no acreditan obligaciones iguales a cero y que registrar gastos no demuestra pagos.

Orden global descendente por centavos enteros exactos, sin sumar importes en React; Number exclusivamente para geometría SVG. Tabla, tooltips y totales usan strings originales del backend. Nombres completos en tooltip y tabla, con etiquetas adaptativas abreviadas en el eje; tabla desplegable con encabezados y caption. Barras con extremos redondeados y degradados suaves: verde menta para recurrentes, azul para adicionales; el tipo también se expresa en texto. Paleta y contenedores siguen la identidad existente. Tooltip por teclado, contraste, foco visible y movimiento reducido; animación de barras de 450 ms cuando se permite.

Dependencias: Recharts estable 3.10.1, MIT, pares compatibles con React 19; react-is 19.3.0 coincide con React/React DOM instalados. Verificados registro npm y [documentación oficial](https://github.com/recharts/recharts). Se agregaron únicamente estas dependencias directas y sus transitivas, sin actualizar versiones preexistentes. Medición local previa: entrada JS 177,60 kB / 54,09 kB gzip; con entrega, aproximadamente 180,50 / 55,24 kB y módulo diferido del gráfico 371,83 / 109,38 kB gzip. El módulo gráfico no se descarga hasta abrir el bloque. CSS crece aproximadamente 0,94 kB gzip; dependencias compartidas e importación diferida añaden aproximadamente 0,17 kB gzip en los otros chunks iniciales. Son mediciones del build, no tiempos de red garantizados.

Validación: typecheck, lint y build local aprobados; suite normal 203 pruebas aprobadas y 162 casos DB opt-in omitidos, sin integración DB. Suite focalizada de Estadísticas/IPC: 26 aprobadas, incluidas seis nuevas de orden/precisión, tabla, vacío, carga/error/desactualización, ID recibido y respuestas tardías. El primer intento de Vitest fue bloqueado por EPERM al renombrar temporales y no ejecutó casos; reintento autorizado fuera del sandbox. Build conserva avisos no bloqueantes ya conocidos de anotaciones de Zod.

QA en navegador exclusivamente con fixture sintético sin backend: 390/700/701/768/1024/1440/1920 px sin overflow horizontal, tabla abierta y nombres largos; carga, error recuperable, vacío, discrepancia de lecturas, tooltip por flechas, preferencia reducida simulada en fixture y cambio a período cerrado mientras llega una respuesta antigua. Ver desglose concilia total/cantidad con el gráfico y el KPI en el caso de éxito. No equivale a una auditoría con lector de pantalla ni a revisión manual del propietario sobre datos reales. Capturas locales de revisión en `tmp/iteration9-expenses-desktop.jpg` y `tmp/iteration9-expenses-mobile.jpg`.

Prueba de revisión sin DB: abrir `/tests/browser/statistics.html` en Vite, desplegar Gastos y su tabla, navegar las barras por teclado y cambiar el selector mensual. Escenarios del fixture mediante `?expenses=empty`, `error`, `mismatch`, `slow` o `reduced`; solo datos sintéticos, sin escrituras. Para revisión autenticada real utilizar el arranque local habitual y `/estadisticas`, a cargo del propietario; no se declara aprobada en esta entrega. El siguiente paso es su revisión visual/funcional, sin iniciar ampliaciones ni versionado automáticamente.

### Refinamiento visual posterior — referencia Corel

Autorización posterior del propietario sobre el primer bloque, con referencia `estilo graficos.png`: encabezado y contenido con rosa `#FF99CC` transparente, conservando intactos KPI, cálculos, endpoint y contrato. Base del acordeón al 3 % de opacidad, encabezado al 20 % y tile interior al 8 %; hover del encabezado al 25 %. Barras cian y azul suave con degradados, leyenda superior derecha y `[i]`, sin repetir Recurrente/Adicional bajo cada categoría. Textos principales limitados a COMPOSICIÓN DEL MES y ¿Dónde se concentran los gastos? Metodología, límites de cobertura, ARS y navegación se trasladan al panel de información existente, con Escape y retorno de foco.

Grilla preparada para tres columnas iguales y gaps de 14 px, con reducción responsive a dos/una según el ancho disponible. Mientras exista un único gráfico, su tile abarca las columnas disponibles: evita espacios artificiales y prioriza legibilidad, sin implementar ni simular otros gráficos. Acordeón de ancho completo. Tabla secundaria mediante Ver tabla: categoría/concepto, tipo e importe exacto, total y caption accesible corto sin explicación visible redundante; cantidad de movimientos permanece disponible en el tooltip y modal original.

Se conservan todas las categorías/conceptos con movimientos, sin Top N ni máximo artificial. Altura dinámica de 42 px por categoría más ejes, con mínimo de 230 px. Verificación sintética en navegador: seis recurrentes y ocho adicionales producen 14 barras/14 filas y $105.000,00 conciliados con KPI y modal; veinte categorías producen 20 barras/20 filas y $210.000,00, también sin omisiones en móvil. Estos importes son fixtures de prueba, nunca valores reales o parámetros del negocio. Casos nuevos `?expenses=many14` y `?expenses=many20` en el fixture existente.

Regresión normal: 205 pruebas aprobadas y 162 casos DB omitidos; focalizadas de Estadísticas/IPC: 28 aprobadas. Revisión responsive a 390/700/701/768/1024/1440/1920 px sin overflow horizontal, con tabla abierta. Panel de información, Escape y tabla simplificada comprobados en navegador. Typecheck, lint, build y diff check se informan en la entrega final; sin integración DB ni cambios de dependencias. Capturas de revisión en `tmp/iteration9-expenses-refined-desktop.jpg` y `tmp/iteration9-expenses-refined-mobile.jpg`. Sin commits nuevos ni publicación; pendiente de revisión del propietario.

### Reajuste posterior — dos tiles y anillo de Honorarios

Este pedido posterior sustituye la grilla de tres columnas y el control Ver tabla del refinamiento anterior. El primer acordeón ocupa todo el ancho y contiene exactamente dos tiles de igual ancho en desktop (equivalentes a tres KPI cada uno cuando los seis KPI están en una fila); se apilan en mobile hasta 700 px y cuando el área disponible es de 650 px o menos. Conserva rosa #FF99CC: encabezado 20 %, tiles 8 %, sin tercer gráfico ni contenido ficticio.

Gastos conserva todos los recurrentes y adicionales con movimientos del mes, sin Top N; orden exacto, tooltip con nombres completos e importes y flechas de teclado. Se elimina el subdesplegable visible y su CSS; permanece una tabla exclusiva para lectores de pantalla, sin otro bloque visual. Los dos textos principales y la ayuda [i] se conservan. KPI y modal de desglose no cambian.

Honorarios usa las tres métricas y los sobrepagos del resumen existente. El anillo tiene tres tramos separados, cada uno comparado con el mismo comprometido conocido: referencia completa, proporción pagada y proporción pendiente. No es una torta de comprometido + pagado + pendiente. Los contornos permanecen visibles cuando un tramo tiene cero; 50 % ocupa la mitad de su tramo y 100 % lo completa. Referencias accesibles mediante botones con foco e importes exactos; el centro actualiza el detalle por foco/puntero. Sin animación del anillo, compatible con movimiento reducido.

Excepción consultada y aprobada expresamente por el propietario: proporciones solo con cobertura completa, comprometido positivo y valores conciliados sin sobrepagos. El cero registrado sin movimientos de pago permite mostrar Pagado al 0 %. Ante importes indefinidos, base cero o sobrepagos se muestran contornos, valores exactos/subtotales conocidos y una advertencia breve; no se afirma la igualdad. La igualdad se valida por centavos enteros, no se recalculan saldos; Number solo determina geometría. No hay cambios de backend, endpoints, contratos, DB ni dependencias nuevas en este reajuste.

Escenarios sintéticos adicionales del fixture: ?fees=unpaid, half, full, partial, zero y empty. El fixture original conserva el caso parcial con sobrepago; septiembre vacío permite verificar el cambio mensual de ambos tiles. Validación del reajuste: typecheck, lint y build aprobados; 214 tests normales aprobados y 162 casos DB omitidos; 37 casos focalizados de Estadísticas/IPC aprobados. El primer intento de Vitest encontró el bloqueo EPERM de temporales; reintento fuera del sandbox satisfactorio. Build con avisos conocidos no bloqueantes de Zod. Chunk gráfico diferido: aproximadamente 394,28 kB / 114,85 kB gzip; entrada 180,38 / 55,21 kB gzip, sin dependencias nuevas. QA sintético responsive en 390/700/701/768/1024/1440/1920 px, sin overflow; veinte gastos presentes, cambio mensual de ambos tiles, estados 0/50/100 %, parcial, cero, vacío y sobrepagos; tooltip por flechas, referencia por foco, ayuda y Escape. SVG decorativo fuera de la secuencia Tab; referencias accesibles en la leyenda. No equivale a auditoría con lector de pantalla ni a validación sobre datos reales. Capturas locales: tmp/iteration9-two-tiles-desktop.jpg y tmp/iteration9-two-tiles-mobile.jpg. Sin commits nuevos; revisión visual/funcional del propietario pendiente.

### Corrección del propietario — dona por facilitador

El propietario rechazó el anillo global anterior: queda sustituido por una porción de igual tamaño por facilitador del mes. Consulta existente facilitator-accounts agrupada por instructor_id; suma exacta de cuentas por actividad, sin nuevas fórmulas de saldos ni backend. Relleno respecto del importe individual A pagar: cero pagos solo contorno, parcial proporcional, completo lleno. Indefinidos, base cero o sobrepagos conservan contorno y advertencia. Nombres visibles en leyenda accesible, importes exactos por persona. La palabra Comprometido se elimina de este tile; los KPI existentes no se modifican.

Anillo máximo 220 px, antes 340; barras con 32 px por categoría, antes 42, conservando todos los gastos. Dos tiles desktop, apilados en mobile, sin Ver tabla ni scroll interno. QA sintético: seis facilitadores en octubre y cinco en septiembre, pagos cero/parcial/completo, 390 px sin overflow. Altura desktop medida de ambos tiles: 552 px en 1440 px, frente a aproximadamente 640 px anteriores. Typecheck, lint y 214 tests normales aprobados; 162 casos DB omitidos. Sin backend, DB, commit ni publicación. Captura tmp/iteration9-facilitators.jpg.

### Ajuste fino de layout lateral

Honorarios presenta tres columnas internas en desktop: mitad de facilitadores a la izquierda, dona central ampliada hasta 300 px y resto a la derecha. Cantidad dinámica, nombres e importes exactos visibles, misma identidad cromática y estados de pago individuales. En tiles estrechos (hasta 450 px de contenido) el círculo ocupa la fila superior y las dos listas quedan debajo, sin overflow ni scroll interno. Títulos de ambos gráficos aumentan 2,8 px respecto de los límites anteriores (más de dos puntos tipográficos); Honorarios usa peso 750. Gastos conserva todos sus datos sin Ver tabla. Altura medida desktop amplio: aproximadamente 399 px por tile. Sin cambios de lógica, backend, dependencias, DB ni commits. Captura de revisión: tmp/iteration9-fees-three-columns.jpg.

## Cierre productivo de la primera entrega de Iteración 9 — 2026-10-24

Confirmación del propietario: push exitoso de `main` a GitHub, publicación de `ab7e321` en https://crm.prismacomunidad.com.ar, build SiteGround `1792806441-rucfav` con `build_script_exit_code = 0`, y revisión funcional/visual productiva satisfactoria. Incluye los commits locales `1665851` (identidad), `32bc12e` (gráficos y pruebas) y `ab7e321` (documentación), desde `3370c45`. Codex comprobó solo Git y código locales: `main`, referencia local `origin/main` y rama de desarrollo en `ab7e321`, árbol limpio al comenzar; no consultó GitHub ni inspeccionó producción o DB en este cierre.

Alcance final publicado, que sustituye las propuestas previas de representación: Gastos incluye todos los recurrentes/adicionales con movimientos, orden descendente exacto, tooltip y alternativa para lectores de pantalla. Honorarios usa cuentas del período agrupadas por facilitador, una porción de igual tamaño por persona y relleno según sus pagos/importe a pagar; no es una dona de magnitudes globales. Indefinidos, cero y sobrepagos preservan importes y contornos sin proporciones engañosas. La conciliación contrasta cuentas con resumen por magnitudes equivalentes y cobertura, advierte discrepancias y permite refrescar ambas fuentes. KPI «A pagar» y acordeón «Gastos operativos y honorarios»; conceptos económicos separados.

Identidad aprobada: fondos carbón, tarjetas destacadas con un mismo tinte cian uniforme equivalente al menú activo, gráficos `#151A1C` con degradados glass suaves, paleta cian/violeta/dorado/blanco y encabezado rosa preservado. Dos tiles proporcionados en desktop y apilados en móvil. Recharts 3.10.1 y react-is 19.3.0 publicados; sin nuevas migraciones SQL ni modificación de fórmulas backend. Validaciones técnicas y funcionales previas satisfactorias; no repetidas en este cierre documental. El detalle menor de tooltip abierto durante estrechamiento de ventana informado en la revisión local no fue corregido en esta intervención ni se atribuye una comprobación productiva independiente.

Las menciones históricas a revisión, commits o publicación pendientes quedan superadas para esta primera entrega. Próximos primarios mensuales: Estado de cobranzas e Inscripciones por actividad, cada uno con aprobación previa; la primera entrega no autoriza los restantes gráficos. D020–D023 y la futura integración IA conservan sus límites, sin implementación ni autorización de acceso externo. Los Markdown privados permanecen fuera del alcance.

## Estado de cobranzas — diseño aprobado 2026-10-24

El propietario aprueba la barra, la extensión mínima del contrato/backend y su implementación/pruebas locales en `codex/iteration-9-collections-chart`, desde el commit documental de cierre en main. Aprueba expresamente el porcentaje visible sobre obligaciones conocidas; esta decisión sustituye la propuesta anterior «sin porcentaje inicial» y el estado histórico de porcentaje pendiente. No autoriza publicación, migraciones, nuevas dependencias ni commits de código.

Inspección focalizada del código local del 24/10/2026, sin consultas a DB ni datos productivos. Pregunta: «¿Cuánto deberíamos cobrar, cuánto cobramos y cuánto queda pendiente durante el período seleccionado?». Las magnitudes existentes responden sobre registros actuales; no acreditan que todas las obligaciones hayan sido cargadas.

### Existente y reutilizable

- `GET /api/statistics/summary?period_id=…`, contrato `shared/statistics.ts`, consultas `server/statistics/index.ts` y motor `server/statistics/engine.ts`: devuelve `due`, `collected`, `debt`, `credit`, importes string exactos, universo/definidos/indefinidos/sin cuenta, cobertura, fuentes, eje económico y `as_of`. Lectura autenticada consistente, snapshot READ ONLY; Decimal local de precisión 40. No sumar por joins de inscripciones/horarios.
- Universo del resumen: `period_memberships` del período, con LEFT JOIN de `monthly_accounts` y pagos previamente agregados por cuenta. Una membresía sin cuenta entra como falta de información. Cero definido es distinto de NULL. Personas archivadas no se filtran de este universo histórico.
- Cobros Período usa `/api/accounts?period_id=…` y `/api/payments?period_id=…`: cuentas con `amount_due`, `paid` y saldo firmado, y movimientos con fecha, medio y receptor. `/accounts` no incluye membresías sin cuenta, y ambas lecturas son independientes; no reemplazan el universo ni el snapshot del resumen. Sus respuestas contienen datos personales innecesarios para este gráfico agregado.
- El eje es el período económico de la cuenta. La fecha efectiva del movimiento puede ser de otro mes; no convertir este gráfico en flujo de caja por fecha. `collected.universe` cuenta movimientos de cobro, no personas/cuentas; para cobertura usar metadatos de `due`.

### Métricas y conciliación

Para cada cuenta de importe definido, D = importe a cobrar y P = suma de cobros imputados. Se mantienen las fórmulas existentes:

| Magnitud                                             | Definición y cobertura                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| A cobrar conocido A                                  | Suma de D definidos. Incluye D = 0; excluye NULL y miembros sin cuenta.                 |
| Cobrado registrado C                                 | Suma de P de todas las cuentas del universo, incluso con D indefinido; puede superar A. |
| Deuda conocida B                                     | Suma de max(D − P, 0), solo cuentas definidas. No compensar deudas con créditos ajenos. |
| Crédito conocido E                                   | Suma de max(P − D, 0), solo cuentas definidas. Se informa separado, sin reducir B.      |
| Aplicado a obligaciones conocidas K — propuesto      | Suma de min(P, D) en cuentas definidas, equivalente a A − B. No es el total cobrado C.  |
| Cobros con importe a cobrar indefinido U — propuesto | Suma de P en cuentas con D NULL; no afirmar que son créditos ni obligaciones cubiertas. |

Las descomposiciones válidas son A = K + B y C = K + E + U, dentro del mismo universo y snapshot. Con cobertura completa U = 0 y A = C + B − E; A = C + B solo si además E = 0. No usar C + B como total indiscriminadamente. Ejemplo exclusivamente sintético: dos cuentas de 100, con cobros 150 y 0, dan A = 200, C = 150, B = 100, E = 50, K = 100. Apilar C y B produciría 250, incorrecto para A.

### Gráfico recomendado — propuesta, no implementación

Una barra horizontal apilada en el acordeón diseñado «Ingresos y cobranzas», con título «Estado de cobranzas». Representa únicamente A: tramo cian K («Aplicado a obligaciones conocidas») y tramo dorado B («Pendiente conocido»). Fondo `#151A1C`, degradados translúcidos y trazos suaves Recharts; violeta/blanco para referencias pequeñas y texto. Créditos E y cobros sin base definida U se explican fuera de la pila, en una nota compacta cuando existan. Tooltip/alternativa accesible con importes exactos, período y denominador; ninguna leyenda debe llamar «Cobrado total» a K.

El valor agregado respecto de los seis KPI es mostrar la composición de la obligación conocida y explicar por qué el cobrado registrado puede exceder lo aplicado. No crear nuevas tarjetas KPI, dona adicional ni serie histórica. Barras independientes de C/A/B perderían esa lectura y repetirían los KPI; una dona no mejora la comparación y ya tiene otro significado en Honorarios. Porcentaje visible obligatorio: K / A × 100, identificado como «Obligaciones conocidas cubiertas», calculado en backend con precisión decimal; rango 0–100 por construcción, sin recortar datos inconsistentes. Para A no positiva, mostrar «No calculable», nunca 0 % o 100 % artificial.

Cobertura parcial: representar solo la base conocida y mostrar «Base conocida: n de N personas del período», con cantidades de importe indefinido y sin cuenta, fuera de la pila y sin prometer completitud económica. Todo indefinido o A = 0: no dibujar una barra porcentual; mostrar «No calculable» y «Sin base positiva conocida», distinguir cobertura y conservar C/E/U. Universo vacío: estado sin personas/cuentas del período; carga y error nunca como cero. Sobrepago con D = 0 es crédito, no relleno de una obligación inexistente. Pagos parciales o varios cobros se agregan por cuenta; no generan porciones adicionales. Período abierto se señala provisional y cerrado sigue siendo lectura histórica del estado actual, no snapshot inmutable.

### Contrato y límites técnicos propuestos

No hace falta un endpoint de detalle ni migración: se propone reutilizar el endpoint y snapshot del resumen. Los datos de origen existen, pero el contrato actual no expone explícitamente K ni U ni la separación de cobros conocidos/desconocidos. A − B y C − K − E permiten deducirlos algebraicamente; se recomienda que el motor analítico backend los entregue como agregados exactos tipados, con cobertura documentada, para no trasladar nuevas definiciones económicas a React ni duplicarlas para futura IA.

La representación aprobada requiere una extensión acotada del contrato/resumen (K/U y porcentaje decimal o null sin base positiva), preservando consumidores existentes. No alterar las ocho métricas existentes, las reglas de registración ni los saldos. Leer agregados y KPI de la misma respuesta; exigir conciliación por centavos y metadatos equivalentes, y advertir discrepancias verificables sin inventar ajustes. Number solo para geometría. No es una limitación de DB ni una dependencia de nuevas fuentes; queda autorizada esta extensión backend/contrato, sin nuevos endpoints ni SQL.

### Validación futura y aprobación requerida

Pruebas focalizadas sintéticas: universo vacío; miembro sin cuenta; D NULL con/sin cobros; D = 0 con/sin crédito; sin cobros, parcial, completo, varios pagos, sobrepago; deuda y crédito en personas distintas; cobertura mixta; centavos/importes altos; A = K + B y C = K + E + U sin compensación entre personas. Comprobar deduplicación, personas archivadas, fechas de cobro fuera del período, lectura de período cerrado y metadatos del snapshot. Adaptar pruebas existentes; integración DB solo si el cambio futuro de consultas la justifica y exclusivamente en prisma_test.

UI futura: conciliación con KPI y Cobros explicando universos, cambio rápido de período/respuestas tardías, carga/error/reintento, teclado/touch/foco, alternativa accesible, contraste, móvil/desktop y movimiento reducido. Preservar los dos gráficos publicados y no generar acordeones vacíos.

Aprobado: barra K/B con porcentaje visible sobre A conocido, créditos y cobros indefinidos separados, cobertura explícita dentro de «Ingresos y cobranzas», extensión mínima backend/contrato e implementación y validación focalizadas. Cuando A no sea positiva, «No calculable». Inscripciones por actividad conserva la prioridad siguiente y necesita su propio alcance. Este corte documental precede a la implementación de Cobranzas; publicación y versionado del código requieren aprobación posterior.
