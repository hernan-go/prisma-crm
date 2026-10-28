# PRISMA CRM — Decisiones de producto y arquitectura

Este documento registra decisiones que no deben rediscutirse en cada iteración salvo que exista un motivo explícito para cambiarlas.

## D001 — Git y producción

`main` es productiva y su push dispara deploy en SiteGround. Los pushes y la integración a main quedan manuales del propietario después de validar y aprobar. En iteraciones aprobadas, Codex administra autónomamente Git local, archivos, validaciones y commits dentro del alcance autorizado; se mantienen prohibidas las operaciones Git destructivas y los cambios productivos.

## D002 — Migraciones aplicadas son inmutables

No editar migraciones ya aplicadas. `001.sql` a `011.sql` aplicadas y registradas en producción según operaciones y verificaciones del propietario confirmadas el 23/10/2026; Codex no realizó una comprobación productiva independiente. `009.sql` separa receptor/medio; el cierre previo de Cobros en `df04f17` conserva su evidencia. `010–011` incorporan Gastos Recurrentes e independencia mensual, también aplicadas en `prisma_test` y `prisma_dev`. Pruebas destructivas y de recuperación exclusivamente en `prisma_test`. Próxima numeración: `012.sql`. Reintentos deben soportar DDL parcial de MySQL.

## D003 — Dinero

Usar `DECIMAL(12,2)`. Nunca `FLOAT`.

## D004 — Períodos explícitos

Un período solo existe si fue creado explícitamente mediante la funcionalidad de períodos. Ningún gasto, fecha, importación o migración puede crearlo automáticamente.

## D005 — Fecha de gasto

La fecha de un gasto debe pertenecer exactamente al período seleccionado. Esto se valida en frontend y backend.

## D006 — Gastos sin categorías por defecto

`Publicidad`, `Insumos`, `Otros`, etc. no se crean automáticamente. Cada período empieza sin categorías y el usuario crea solo las que necesita.

## D007 — Gastos y cierre de período

Un período cerrado es de solo lectura. Crear, editar o eliminar categorías/gastos requiere reabrir explícitamente el período.

## D008 — Publicidad histórica

`advertising_investments` se conserva como respaldo. El modelo operativo actual es `period_expense_categories` + `period_expenses`.

La migración histórica solo opera sobre períodos existentes. Si encuentra un histórico sin período, debe detenerse e informar; nunca inventar el período.

## D009 — Actividades históricas

`activities.instructor_id` es legado y no es fuente de verdad histórica. La asignación real de facilitadores se resuelve mediante horarios/ofertas del período.

## D010 — Clonación de períodos

La clonación implementada copia configuración operativa, no movimientos, personas ni membresías.

Copiar:

- ofertas/actividades del período;
- nombre de oferta;
- modalidad;
- días;
- horarios;
- facilitadores asignados;
- configuración necesaria para iniciar el nuevo período.

No copiar:

- personas;
- inscripciones;
- cuentas mensuales;
- cobros;
- pagos;
- deudas/saldos;
- cuentas/pagos de facilitadores;
- gastos;
- ningún movimiento financiero.

## D011 — Receptor y medio de cobro independientes

- Receptor de cada payment: `jesica` (Jésica) o `hernan` (Hernán), responsable del dinero PRISMA.
- Medio: exclusivamente `cash` (Efectivo) o `transfer` (Transferencia).
- Las cuatro combinaciones son válidas. Nuevos pagos requieren ambos campos explícitos, sin defaults ni dependencia entre selectores.
- `009.sql` materializa la clasificación histórica vigente: cash → jesica y transfer → hernan. No deja receptores nulos, no agrega legacy_method ni cambia timestamps.
- No cambia cuentas, saldos, sobrepagos, membresías ni cierre de períodos.
- Forms conserva su clave conservadora de duplicados sin recipient. Hashes/receipts anteriores se preservan; reconocimiento legacy exclusivamente de operaciones completadas.

## D012 — Modelo financiero único PRISMA

La separación especial de Informática y Cartera Independiente fue evaluada y descartada por el usuario. Se reemplaza la decisión anterior de separar ingresos. No agregar cuentas independientes, clasificación por actividad, exclusiones del Dashboard ni reglas particulares de deuda. Esta iteración solamente separa receptor y medio en payments.

## D013 — Estadísticas

Antecedente del 2026-10-22: la ruta y pantalla existían como shell visual cuando Hernán aprobó las definiciones funcionales principales del diseño de la iteración 8. La implementación requería autorización expresa. Estado posterior: resumen v1, IPC y desglose de gastos implementados; publicación en `51e247e` y validación productiva confirmadas por el propietario el 23/10/2026. Los siete acordeones y sus gráficos siguen diseñados, sin implementar. La ampliación estratégica se registra en D020, sin alterar los acuerdos originales siguientes.

- Resumen ejecutivo inicial limpio, prioritariamente económico, seguido de siete categorías en acordeones con una sola categoría abierta por vez.
- Recharts es la primera opción gráfica; instalación, versión y validación quedan para una etapa posterior.
- Motor determinista reutilizable, con precisión decimal y distinción entre período económico, fecha de movimiento y fecha de registro.
- Importes parcialmente conocidos se presentan como subtotales con advertencias de cobertura. `amount_due=NULL` no equivale a cero; deudas y créditos se mantienen separados, sin compensar personas.
- Continuidad principal sobre personas únicas con inscripción en períodos mensuales consecutivos, diferenciada de la pertenencia por membresías. Inscripción no prueba asistencia y ausencia posterior no prueba abandono.
- No presentar ganancia neta ni un resultado parcial como beneficio hasta aprobar el modelo contable. No atribuir el importe íntegro de un paquete a cada actividad.

Categorías, indicadores v1, limitaciones, propuestas técnicas y decisiones pendientes: [diseño funcional de Estadísticas](iterations/2026-10-statistics-design.md). Este acuerdo no autoriza código, dependencias, migraciones, conectores ni cambios del Dashboard.

## D014 — Pertenencia explícita a períodos

La existencia de una persona en BBDD no implica pertenencia a ningún período. La pertenencia persona ↔ período es explícita e independiente de las actividades. `period_memberships` es su fuente canónica.

- Agregar al período crea únicamente membresía, sin cuentas, importe a cobrar, inscripciones ni pagos.
- Una persona puede pertenecer sin actividades; cancelar la última actividad no elimina su membresía.
- Quitar bloquea con `409` ante cualquier inscripción, pago o importe a cobrar definido, incluido `0.00` (decisión explícita de no cobrar ese mes).
- Una cuenta estrictamente vacía (`amount_due IS NULL`, cero pagos y cero inscripciones del mismo par persona/período) puede eliminarse automáticamente al quitar la membresía. `NULL` significa importe todavía no definido; no equivale a cero.
- Eliminar cuenta vacía y membresía es atómico dentro de `peopleTransaction`; cualquier fallo revierte ambas eliminaciones. Nunca se elimina la persona global ni datos de otros períodos. Sin cuenta ni inscripciones se elimina solamente la membresía.
- Períodos cerrados conservan lectura histórica y bloquean altas/bajas de membresías.
- Personas archivadas no pueden incorporarse; sus membresías existentes siguen visibles.
- Crear/clonar períodos deja cero membresías. Importar personas al catálogo global no incorpora a ningún período; confirmar la importación específica de inscripciones sí incorpora explícitamente a las filas no omitidas, dentro de su transacción.
- El backend valida pertenencia y período antes de escribir; FK compuestas desde inscripciones/cuentas refuerzan integridad sin cascadas destructivas.

## D015 — Configuración eliminable e historia persistente

Configuración no equivale a historia. Las eliminaciones son explícitas, acotadas y transaccionales dentro de `peopleTransaction`, sin nuevas cascadas ni desactivar FK.

- Eliminar un período exige estado abierto y ausencia de membresías, inscripciones, cuentas/cobros, cuentas/pagos de facilitadores, gastos y referencias externas/incompatibles a sus horarios. Publicidad histórica del mismo mes también bloquea. Se elimina exclusivamente su configuración: categorías vacías, asignaciones, horarios, días y ofertas; después el período. Catálogos, personas y otros períodos se conservan.
- Para eliminar el período completo, `period_activities.ever_used` y `activity_schedules.ever_used` no bloquean por sí solos: pueden quedar de inscripciones canceladas explícitamente. No se ponen en cero. Esta regla se basa en datos persistentes actuales, no afirma que nunca hubo operaciones.
- Editar año/mes exige un período abierto realmente vacío de configuración y datos. Un período cerrado debe reabrirse antes de editarlo o eliminarlo.
- DELETE individual de oferta exige oferta y todos sus horarios nunca utilizados, sin inscripciones, slots ni cuentas de facilitadores. Elimina días, horarios y asignaciones propios, sin eliminar la actividad global.
- DELETE individual de horario exige `ever_used=0`, sin slots ni asignaciones del par oferta/facilitador con cuenta persistida que necesiten preservar su snapshot. Elimina sus asignaciones y el horario, conservando la oferta.
- Oferta/horario utilizados conservan sus protecciones de edición y borrado individual aun después de cancelar inscripciones; pueden deshabilitarse.
- Los flags globales de actividades/facilitadores siguen almacenados y activándose por compatibilidad, pero no determinan por sí solos borrabilidad ni la etiqueta «Con historial». Una actividad global requiere cero ofertas y cero inscripciones; primero deben retirarse explícitamente sus ofertas preparatorias.
- Un facilitador global sin historia puede eliminarse retirando sus asignaciones a horarios nunca usados, en una misma transacción. Bloquean horarios usados, slots, cuentas/pagos, referencias legacy y períodos cerrados cuyas asignaciones deban modificarse. Los otros facilitadores y los horarios se conservan.
- Cualquier cuenta de facilitador bloquea, incluso con importe NULL y sin pagos: no se define una excepción de cuenta vacía en esta iteración.
- Categorías sin gastos son configuración eliminable junto con el período. Cualquier gasto bloquea el período antes de borrar categorías. El DELETE individual de categoría conserva su comportamiento existente.
- QA usa la misma función de eliminación de catálogos que la API, conservando lista permitida, revisión y fingerprint.

Sin migración ni recálculo/reset de flags. Los receipts se conservan: su hash no permite reconstruir el período y no hay una auditoría completa de movimientos ya eliminados. Evidencia productiva de Noviembre 2026 aportada por el usuario; Codex no consulta ni modifica producción. Detalle: `iterations/2026-10-configuration-cleanup-rules.md`.

## D016 — Dashboard y período seleccionado

Todo dato administrativo y operativo del Dashboard pertenece al período seleccionado: KPIs, carteras, saldos, gráfico y programación semanal con inscriptos. La programación usa el día semanal actual dentro de ese período, incluso histórico o futuro; no afirma asistencia ni clases efectivamente dictadas. Solo fecha/hora y eventual clima representan el momento actual en Argentina, independientemente del período.

«Total inscriptos período» cuenta personas únicas incorporadas mediante membresías, incluso sin actividades. «Inscripciones en actividades» cuenta inscripciones, permitiendo que una misma persona participe en varias actividades; varios horarios no agregan inscripciones por sí solos. Se conservan los cálculos existentes del backend. Sin creación implícita de períodos, fallback a otros meses ni cambios de restricciones de períodos cerrados.

## D017 — Honorarios y gastos operativos diferenciados

Hernán confirmó el 2026-10-22 que actualmente los pagos a facilitadores de PRISMA se registran exclusivamente en el módulo Pago Facilitadores, no en Gastos. Es una confirmación del propietario sobre su operación, no una nueva auditoría de datos productivos. No asumir duplicación efectiva sin evidencia.

Honorarios y gastos operativos son dominios diferenciados. Los honorarios son importes fijos por prestación pactada, variables entre facilitadores, actividades y períodos; no porcentajes automáticos de ingresos. Conservar controles para evitar futuras dobles imputaciones, sin modificar ahora la registración. La suma de gastos registrados no demuestra que estén pagados ni habilita por sí sola un resultado neto.

## D018 — Gastos recurrentes configurables y adicionales

Definición aprobada y llevada a implementación local el 2026-10-22. Un concepto recurrente transversal tiene un importe por período: primera carga crea un movimiento y la corrección actualiza el mismo ID. Catálogo configurable por instalación; la acción explícita PRISMA configura Alquiler, Expensas, Luz, Gas, Internet, Agua, Impuestos y Cobertura médica (Emerger, gasto operativo). No hay seed universal, categorías por defecto, creación implícita de períodos ni copia mensual de importes.

Ausencia se muestra como `$ —`; cero histórico válido es distinto de ausencia. Se conserva la restricción de importes positivos nuevos. Primera fecha del gasto vacía y obligatoria dentro del período. Correcciones conservan concepto, fecha y notas salvo edición explícita. Cerrados: consulta, lápiz visible deshabilitado; escritura solo tras reapertura.

Históricos se vinculan expresamente por IDs revisados; no por nombres. Un movimiento se marca conservando campos y timestamps originales. Varios se conservan en revisión, con subtotal de consulta sin fusión ni edición agregada. Desvincular exige confirmación y conserva movimientos en adicionales. El catálogo no cambia nombres mensuales ya persistidos. Con 011, desactivar solo afecta la disponibilidad inicial de períodos futuros: nunca retira presencias mensuales existentes ni sus históricos.

Unicidad MySQL de categoría/concepto/período y movimiento canónico, locks transaccionales, comparación optimista y guardas en todas las rutas genéricas de Gastos. SQL administrativo sin marcador no queda cubierto por el índice: la lectura detecta y bloquea edición ante múltiples/inconsistencias. Estadísticas suma las mismas filas una vez; facilitadores independiente, sin ganancia neta aprobada. 010 validada en prisma_test y aplicada controladamente en prisma_dev con autorización posterior. El propietario informó haber configurado y probado allí los ocho conceptos; Codex no los configuró ni revalidó. Cierre posterior confirmado por el propietario el 23/10/2026: 010–011 aplicadas y registradas en producción, catálogo configurado y ampliado por UI; no asumir ocho conceptos universales. [Diseño](iterations/2026-10-recurring-expenses-design.md) y [cierre técnico](iterations/2026-10-recurring-expenses-implementation.md).

## D019 — Corrección mensual y desglose de Gastos

La acción **Quitar importe** solo elimina el único movimiento recurrente canónico confirmado por ID e importe dentro del período seleccionado. Conserva la categoría y tarjeta, vuelve a representar `$ —` y respeta el bloqueo del período cerrado. Si hay varios movimientos o el registro dejó de coincidir, no elimina una suma ni elige un registro automáticamente. Nunca altera importes de otros períodos.

Estadísticas ofrece **Ver desglose** de movimientos reales del período: recurrentes y adicionales, nombre, importe agrupado por categoría, cantidad de movimientos, subtotales y total. Gastos registrados no significa pagados. El total debe reconciliar con el KPI, y la suma conserva DECIMAL en backend.

La posición y presencia de tarjetas son propias del período, persistidas mediante 011. El contrato fue aprobado e implementado localmente; las pruebas DB automatizadas se realizaron exclusivamente en prisma_test. La activación posterior en prisma_dev y el cierre productivo confirmado por el propietario el 23/10/2026 superan el estado inicial de activación pendiente. Una ausencia se conserva hasta reincorporación explícita, aun si el concepto sigue activo globalmente. Períodos nuevos (también al clonar) incorporan el catálogo activo sin crear categorías, importes ni movimientos. Conceptos nuevos se agregan explícitamente a meses existentes abiertos; cerrados requieren reapertura.

Quitar del período conserva catálogo y categoría; elimina la presencia y, únicamente con confirmación del estado completo, un movimiento canónico único. Múltiples o inconsistencias bloquean la operación. Reincorporar no restaura dinero. Posiciones 1..N únicas y compactas, revisión BIGINT UNSIGNED transportada como texto decimal, transacciones y comparación de revisión rechazan formularios obsoletos con 409. Quitar importe conserva presencia y posición. Estadísticas sigue sumando movimientos reales independientemente de presencia/actividad del catálogo. [Registro histórico de implementación, pruebas y activación](iterations/2026-10-recurring-period-independence.md); estado productivo vigente en [PROJECT_STATE](PROJECT_STATE.md).

## D020 — Doble finalidad de Estadísticas y capa analítica compartida

Ampliación de D013 aprobada documentalmente el 23/10/2026. Estadísticas tiene dos finalidades complementarias: paneles, indicadores, gráficos, distribuciones y comparaciones para la gestión administrativa, financiera, operativa y comercial; e infraestructura analítica reutilizable para futuras consultas autorizadas de ChatGPT u otros asistentes. El objetivo es analizar información actual e histórica, evaluar resultados y tendencias y, con modelos aprobados, simular escenarios y apoyar decisiones estratégicas sin reconstruir manualmente reglas ni depender de capturas. PRISMA es el emprendimiento de la primera instalación, no el nombre genérico del software.

El backend define y calcula las métricas; React y el futuro uso de Recharts son presentación. La interfaz, los informes y las futuras consultas autorizadas deben reutilizar la misma capa analítica. Cada métrica debe disponer de significado, fórmula, fuente, período, criterio temporal, unidad, cobertura y limitaciones. Preservar precisión monetaria y distinguir importe desconocido, cero, ausencia de registros y error; período económico, fecha efectiva del movimiento y fecha de registro son ejes diferentes. Se mantienen las restricciones de D013 sobre asistencia, bajas, ganancias netas y atribución por actividad.

Utilidad analítica, excelencia visual/experiencia de usuario y preparación para IA son dimensiones inseparables: ninguna debe perjudicar a las demás. La calidad estética es criterio de aceptación desde el diseño; cada gráfico debe justificar su presencia por el valor que comunica, con precisión, accesibilidad y coherencia con la identidad del sistema. Criterios y límites de presentación profesional en [Diseño visual y experiencia de usuario](iterations/2026-10-statistics-design.md#diseño-visual-experiencia-de-usuario-y-presentación-profesional).

Este registro no autorizó originalmente la integración. Actualización vigente 25/10/2026: D024 y la etapa local autorizada establecen API empresarial de lectura → complemento MCP privado → ChatGPT; implementación local, sin conexión ni despliegue. Autenticación, permisos, privacidad y trazabilidad siguen siendo obligatorios. No se presume acceso directo de ChatGPT a MySQL; desidentificar no garantiza anonimato.

Estado: resumen v1, IPC y desglose implementados, con publicación y validación productivas confirmadas por el propietario; siete bloques y apertura exclusiva aprobados funcionalmente pero sin implementar. La secuencia mensual → anual → histórica está aprobada como evolución, con entregas sujetas a autorización. Los dos gráficos mensuales de gastos recomendados en la inspección son una propuesta, no un alcance de desarrollo aprobado. La conexión con IA es un proyecto posterior independiente. Detalle técnico en [ARCHITECTURE](ARCHITECTURE.md#estadísticas--v1-publicada-y-capa-analítica-compartida) y secuencia en [ROADMAP](ROADMAP.md#prioridad-5--estadísticas).

## D021 — Honorarios dinámicos y límites del análisis económico

Ampliación de D017 aprobada documentalmente el 23/10/2026 a partir de las aclaraciones del propietario. Los honorarios son mayoritariamente fijos respecto de la cantidad de participantes, sin tarifa universal. Pueden variar entre profesionales, actividades y períodos; renegociarse mensual, bimestral, trimestralmente o cuando corresponda; y aumentar al agregar horarios, sesiones o prestaciones. Un cambio de acuerdo no autoriza sobrescribir importes históricos ni aplicar porcentajes automáticos por participante.

No deducir automáticamente rentabilidad por participante o actividad a partir de esos honorarios. Gastos registrados, honorarios comprometidos, pagos realizados, ingresos atribuibles y resultado económico son conceptos distintos. Tarifas, paquetes, promociones, atribución de ingresos y costos directos/compartidos requieren definiciones adicionales antes de simulaciones o resultados por actividad. No se aprueba aquí una fórmula de ganancia neta ni un nuevo KPI de excedente parcial.

## D022 — Base de Conocimiento Empresarial por instalación

Decisión conceptual aprobada el 23/10/2026. Cada instalación tendrá un Centro de conocimiento privado dentro del sistema en una etapa posterior: cargar, crear, editar, consultar, activar/desactivar, exportar y recuperar archivos Markdown, con historial de versiones y respaldos. Se distinguirán instrucciones del asesor y documentos de conocimiento empresarial. Los documentos no se incorporarán automáticamente al código fuente ni al repositorio público; las instalaciones independientes no compartirán documentos ni información. D024 conserva este desarrollo futuro, sin implementarlo en la API empresarial actual.

El almacenamiento definitivo, los permisos y la recuperación documental se diseñarán posteriormente. El diseño será reutilizable por distintas empresas, sin convertir automáticamente el producto en SaaS. La futura IA consultará únicamente interfaces autorizadas, inicialmente de lectura; los documentos empresariales no podrán anular políticas de seguridad ni autorizar operaciones por sí mismos. Es conocimiento consultable y personalización contextual, no entrenamiento del modelo.

No se implementa el módulo ni se eligen almacenamiento de archivos, base de datos, búsqueda vectorial, API o MCP. Los documentos privados locales excluidos de Git necesitan respaldos independientes: Git no los sincroniza ni aporta su historial de versiones. Límites conceptuales en [ARCHITECTURE](ARCHITECTURE.md#conocimiento-empresarial-y-asesor-ia--diseño-conceptual).

## D023 — Asesor empresarial contextual

Objetivo estratégico aprobado el 23/10/2026: un futuro asistente de gestión combinará conocimiento empresarial privado, indicadores operativos y económicos del sistema y contexto externo verificado y actualizado para evaluar alternativas y planificar decisiones. Abarcará planificación comercial y operativa, calendario de oportunidades, campañas, promociones, eventos y escenarios económicos; su alcance excede el análisis financiero.

La información deberá distinguir hechos, estimaciones y supuestos, identificar fuentes y fechas y explicitar cobertura, costos, riesgos y alternativas. La etapa vigente autoriza backend local de lectura y su validación; conexión del Site y despliegue siguen pendientes de autorización. No hay escritura operativa ni API paga de modelos. Contrato independiente del proveedor; fuentes y alcance vigente en D024 y [planificación comercial](AI_COMMERCIAL_PLANNING.md).

## D024 — Acceso empresarial completo para el asesor autorizado

Decisión expresa y definitiva del propietario del 25/10/2026: PRISMA funciona como libro abierto empresarial para su asesor debidamente autenticado y autorizado. Máxima disponibilidad de información empresarial y mínima exposición de datos personales. Se sustituye la política inicial de supresión generalizada por grupos pequeños: no aplicar umbral de cinco, supresión complementaria ni ocultar economía, actividades o combinaciones infrecuentes. No es autorización de acceso anónimo ni publicación de información empresarial.

Incluir obligaciones, cobros, deudas/créditos, gastos y conceptos/categorías controlados, recurrencia, acuerdos de honorarios y pagos por profesional/actividad, personas/inscripciones/plazas diferenciadas, combinaciones y continuidad/comparaciones según registros existentes. No inventar tarifas/paquetes, bajas reales, capacidad, costos incrementales ni atribuciones de ingreso ausentes. No calcular utilidad neta o rentabilidad por actividad sin modelo aprobado; D021 permanece vigente.

Excluir identidades/IDs reales de participantes, documentos, teléfonos/correos privados, domicilios, emergencias, salud, notas personales, secretos y texto libre privado innecesario. Denominaciones empresariales e identificación operativa de facilitadores son pertinentes; sus contactos/documentos privados quedan excluidos. Agregar combinaciones/continuidad sin exportar IDs; si una futura consulta necesitara detalle de personas, usar seudónimos adecuados y un diseño específico. No se garantiza anonimato frente a información externa o diferencias temporales, y ese riesgo residual no reinstaura supresiones que inutilicen P0.

Arquitectura: sistema → API segura de lectura → complemento MCP privado → ChatGPT, sin API paga de modelos en esta etapa y con contrato independiente del proveedor de IA. La IA recomienda; administradores deciden. Sin escrituras operativas. Centro de conocimiento privado dentro del sistema, con Markdown, acceso y versiones, en etapa posterior; no se implementa ahora.

El asesor combinará datos internos con fuentes externas actuales sobre inflación/indicadores oficiales, ANSES/jubilaciones/pensiones, poder adquisitivo, mercado rosarino, feriados/calendario local, festividades, estacionalidad, eventos y costos. Identificar fuentes y fechas, sin constantes coyunturales permanentes ni integración externa nueva en esta etapa. [Especificación](AI_COMMERCIAL_PLANNING.md) y [entrega local](iterations/2026-10-ai-read-context.md).

## Nota cronológica de estado — 27/10/2026

Esta nota registra un hito posterior, sin introducir una decisión ni reescribir D020–D024. Sus referencias a etapa local, despliegue/conexión pendientes o siete acordeones exclusivos se conservan como antecedentes; el estado operativo actual está en [PROJECT_STATE](PROJECT_STATE.md) y [ARCHITECTURE](ARCHITECTURE.md).

La conexión autorizada ChatGPT ↔ MCP privado ↔ API empresarial 2.0 de lectura está funcionando. Backend publicado en `448554fb38e65ac753161c83616594ccec832eac` en `hernan-go/prisma-crm`; Worker respaldado en el repositorio privado `hernan-go/prisma-mcp`, commit `25487c43778370fce101e24f697b011ff7201219`, tag `v1.0.0`. El propietario confirmó consulta real de octubre de 2026 desde Work y ChatGPT normal. Las 23 pruebas sintéticas del respaldo son evidencia separada; no se afirma conciliación contable con Dashboard ni un procedimiento independiente de redespliegue del mismo Site desde Codex ya comprobado.

Se conservan P0 y la especificación del asistente comercial completo, todavía pendiente; Centro de Conocimiento real y simulaciones pendientes, con cinco documentos ficticios en la herramienta MCP de conocimiento. No hay API paga de modelos ni escritura operativa. Estadísticas tiene 3 de 6 gráficos principales publicados, dos acordeones independientes y Skeleton Loaders exclusivamente en Estadísticas. Google Login sigue aprobado y pendiente de implementación. La Iteración 9 continúa abierta; PRISMA es el emprendimiento usuario del sistema.
