# Asistente de IA para planificación comercial de PRISMA

> **Prioridad: P0 — MÁXIMA (objetivo estratégico principal).**
>
> **Estado: alcance y dirección funcional aprobados; no implementado.** Documento de referencia persistente para futuras iteraciones y handoffs. No autoriza cambios de código, base de datos, arquitectura, documentación existente ni despliegues por sí mismo.
>
> **Alcance del nombre:** PRISMA es el emprendimiento que utiliza el sistema de gestión, no el nombre comercial genérico del software.

## 1. Problema a resolver y resultado esperado

Jesica y Hernán necesitan dejar de invertir tantas horas en elaborar manualmente precios, combinaciones de talleres, promociones y eventos, especialmente al preparar el mes siguiente. El objetivo **no** es agregar gráficos por estética ni una IA que solo resuma datos: es disponer de un **asistente de inteligencia empresarial consultivo, conversacional y orientado a decisiones** que produzca una carta de **tres alternativas comerciales concretas, comparables y económicamente fundamentadas**, con propuestas de eventos y un fundamento estratégico final.

Ejemplo de pedido: «Generá un plan tarifario y de eventos para noviembre, usando los datos reales del sistema, el conocimiento de PRISMA, los costos, la inflación y las oportunidades de Rosario».

La IA **sí debe proponer importes específicos** para talleres individuales, paquetes, promociones y eventos. **Nunca debe presentar rentabilidad como verificada sin datos suficientes para calcularla.** Su objetivo económico principal es evitar escenarios de pérdida bajo los supuestos declarados, además de mejorar captación, continuidad, participación y aprovechamiento de actividades y horarios.

## 2. Salida mínima que se espera del asistente

Para cada planificación mensual, producir una respuesta ordenada con:

### A. Tres opciones comerciales alternativas

**Opción 1 — Captación de participantes** (u otro objetivo comercial justificado):
- Tarifas mensuales sugeridas por taller individual.
- Paquetes concretos de dos y tres talleres/horarios, con combinaciones permitidas y precios propuestos.
- Promociones y condiciones de aplicación.
- Costos considerados, ingreso proyectado, margen estimado, cupos y mínimo de participantes necesario cuando sea calculable.
- Ventajas, riesgos y condiciones de viabilidad.

**Opción 2 — Impulso de actividades seleccionadas:** misma estructura, privilegiando actividades que el usuario indique (p. ej., Inclusión Digital), respetando pisos de precio, límites y restricciones expresamente fijados.

**Opción 3 — Sostenibilidad / optimización económica:** misma estructura, priorizando cubrir costos y fortalecer el excedente operativo sin ignorar el carácter social y las necesidades de personas mayores.

Las tres opciones deben ser **realmente diferentes y comparables**, no variaciones meramente cosméticas. No deducir que «más inscripciones» equivale automáticamente a «más rentabilidad».

### B. Oportunidades de eventos especiales

Presentar **hasta tres propuestas pertinentes** para el mes y la localidad, respaldadas por calendario, estacionalidad y contexto actual verificable (p. ej., Halloween cuando corresponda; otras efemérides o acontecimientos relevantes en Rosario). No inventar eventos ni forzar celebraciones sin sentido para el público.

Para cada evento propuesto indicar:
- Propósito, público, dinámica, juegos/actividades y logística básica.
- Si conviene o no ofrecer merienda, té, pizza u otros servicios y **presupuesto máximo** para esos conceptos.
- Costos fijos y variables, capacidad disponible, precio sugerido de entrada, concurrencia mínima para cubrir costos y escenarios de resultado económico.
- Riesgos, condiciones de viabilidad y datos faltantes.

### C. Fundamentación final

Cerrar con **aproximadamente 300 palabras** que expliquen por qué se eligieron los paquetes, los precios, las promociones y los eventos; cuáles son los datos que sostienen las recomendaciones, cuál es el contexto local/estacional y qué incertidumbres subsisten. Diferenciar hechos comprobados, supuestos, escenarios y juicio profesional.

## 3. Conversación iterativa y continuidad de decisiones

La planificación se construye por iteraciones. Por ejemplo:

«Conservamos Halloween y la opción 2 de paquetes, pero proponé otras combinaciones para Inclusión Digital; no queremos cobrar menos de $30.000».

El asistente debe:
1. **Conservar** los elementos seleccionados provisionalmente y las restricciones vigentes en esa conversación.
2. **Modificar solo** la parte solicitada, sin rehacer ni perder el resto.
3. Recalcular precios, márgenes y escenarios afectados por esos cambios.
4. Comparar las nuevas alternativas con las anteriores y exponer ventajas y riesgos.
5. Distinguir explícitamente **propuesto**, **seleccionado provisionalmente** y **aprobado por Jesica/Hernán**.

Los pisos de precio mencionados en ejemplos son **restricciones hipotéticas**, nunca tarifas definitivas almacenadas por este documento.

**Primera versión: la IA es asesora y simuladora en el chat. No escribe en el sistema, no crea paquetes, no registra eventos, no cambia tarifas, no altera cuentas ni ejecuta operaciones administrativas automáticamente.** Las decisiones finales corresponden a Jesica y Hernán.

## 4. Fuentes necesarias y controles de confiabilidad

1. **Sistema de gestión (datos estructurados):** inscripciones por actividad/período, personas únicas, horarios/plazas contratadas, cupos cuando existan, cuentas, importes, cobranzas, gastos, honorarios, precios y promociones vigentes o anteriores cuando estén registrados.
2. **Know-how privado:** archivos Markdown privados del emprendimiento, sus criterios comerciales, necesidades de adultos mayores, flexibilidad de pagos, reglas y excepciones de operación. Mantenerlos fuera de Git y no copiarlos a documentación pública del repositorio.
3. **Contexto externo verificado:** inflación argentina, referencias económicas relevantes, calendario y festividades, estacionalidad y oportunidades de Rosario; señalar fuente y fecha de consulta. No inventar información externa.
4. **Cálculo económico reproducible:** funciones o reglas deterministas auditables para costos, ingresos esperados, márgenes, ocupación y puntos de equilibrio. La IA interpreta y argumenta, pero no sustituye la aritmética verificable.

Si faltan costos, honorarios, cupos o bases comparables, el asistente debe **declarar la insuficiencia** y ofrecer escenarios con supuestos explícitos; **no afirmar «rentable» ni «sin pérdidas» como hechos**. Considerar costos compartidos, variables, posibles aperturas de horarios, descuentos, cobranzas demoradas y sensibilidad a una concurrencia inferior a la prevista. Distinguir **obligación del período** de **fecha efectiva del pago**.

## 5. Reglas de negocio y estadística a preservar

- Trabajamos con **personas mayores**, en Rosario, Argentina. Priorizar viabilidad social y económica, no imponer controles de asistencia ni puntualidad de pagos como requisito general.
- **No se registra asistencia clase por clase**; ausencias no equivalen a fracaso de una actividad o facilitador.
- Una inscripción formal cuenta aunque aún no se haya pagado. Los pagos pueden ser parciales, tardíos y se imputan al período correspondiente.
- Las estadísticas son **dinámicas sobre registros conservados**; no imponer fotografías mensuales inmutables como prerrequisito. No agregar bandas de incertidumbre arbitrarias.
- Distinguir personas únicas, actividades diferentes, horarios/plazas semanales contratadas e inscripciones históricas reales. Por ejemplo, Yoga en dos horarios más Movimiento son **1 persona, 2 actividades diferentes y 3 plazas semanales**, no 3 personas.
- Cambios **reales** de actividad dentro de un período deben poder contarse en ambas actividades a efectos de demanda histórica; **correcciones de errores de carga** no deben generar una inscripción histórica adicional. Aún falta comprobar si la persistencia actual permite esta distinción: **no asumirlo implementado**.
- Archivar personas no debería borrar relaciones históricas; comprobar manejo de cancelaciones antes de decidir cambios estructurales.
- Las promociones, combinaciones y precios **varían por período** y pueden tener excepciones. Un borrador de tarifario (por ejemplo, noviembre de 2026) **no** constituye una regla aprobada ni un precio permanente.
- Varias actividades u horarios pueden estar cubiertos por **un solo paquete/obligación económica**; no sumar automáticamente tarifas individuales para determinar precio del paquete.

## 6. Prioridad de ejecución y etapas sugeridas

**P0 / Prioridad máxima de producto: lograr una primera «carta» útil de planificación mensual, antes que multiplicar gráficos sin finalidad.**

1. Aprobar este **contrato funcional** y la estructura de respuesta; verificar compatibilidad con las decisiones existentes de IA **D020–D023** (sin modificarlas automáticamente).
2. Identificar las **decisiones comerciales y económicas mínimas** que deben quedar como datos estructurados y los faltantes reales del sistema para simular precios/eventos con solvencia. No duplicar fuentes ni guardar tarifas operativas en Markdown como única fuente de verdad.
3. Construir o exponer **métricas y cálculos necesarios para esas decisiones**; priorizar datos confiables sobre gráficos decorativos. Diagnosticar persistencia de cambios reales de actividad versus correcciones.
4. Conectar la IA, con acceso de lectura acotado a datos pertinentes y know-how privado, fuentes externas verificables y cálculos controlados.
5. Validar con Jesica y Hernán casos reales: tres planes diferenciados, alternativas de eventos, replaneamiento de solo una parte, piso de precio, escenarios adversos y detección de información insuficiente.

**Fuera de alcance de la primera versión:** escritura autónoma en base de datos, cambios automáticos de tarifas, publicación de propuestas, gestión de asistencia individual, diagnóstico médico o inferencias automáticas sobre motivos de abandono. No se autoriza implementación con este documento.

## 7. Criterios de aceptación funcional

Un primer asistente cumplirá el objetivo solo si:

- Genera **2–3 propuestas viables y comparables**, preferentemente tres, con **precios concretos** para talleres individuales y combinados, y permite elegir/iterar.
- Propone **eventos relevantes con presupuesto, precio, concurrencia mínima y riesgos**, o informa si no hay datos suficientes para un cálculo responsable.
- Identifica cuáles propuestas **cubren costos bajo qué supuestos**, y no asegura ganancias sin respaldo.
- Responde a pedidos de «conservar X y cambiar Y» sin perder el contexto de decisiones provisionales.
- Justifica las recomendaciones con un cierre cercano a **300 palabras** y distingue datos propios, fuentes externas y supuestos.
- Mantiene el principio **solo lectura/simulación** hasta una decisión humana y una acción posterior expresamente autorizada.

## 8. Relación con la documentación del proyecto

Este archivo se propone como **fuente única de verdad funcional** para la prioridad P0 de planificación comercial con IA, ubicado en `docs/AI_COMMERCIAL_PLANNING.md`.

`docs/ROADMAP.md` debería enlazarlo en su primera prioridad; `docs/PROJECT_STATE.md` debería distinguir **especificado, no implementado**. No duplicar toda esta especificación allí. `docs/DECISIONS.md` y las decisiones D020–D023 se conservan como referencia y restricciones existentes, sujetas a revisión focalizada de compatibilidad cuando corresponda.

**Origen:** definición del propietario en conversación de la Iteración 9 (octubre de 2026). **No indica que Codex, el repositorio o producción hayan sido modificados.**
