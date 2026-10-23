# Iteración 8 — Gastos Recurrentes: un importe mensual editable

**Fecha:** 2026-10-22. **Estado:** implementación local autorizada y realizada; migración 010 validada en prisma_test y aplicada controladamente en prisma_dev con autorización posterior. Catálogo de prisma_dev vacío; configuración PRISMA y producción pendientes de autorización independiente. Evidencia y operación en [cierre técnico](2026-10-recurring-expenses-implementation.md).

Rama codex/iteration-8-statistics-design, HEAD/main dcee416. Estadísticas e IPC preservados. La maqueta y tmp/010.sql conservan valor histórico; la migración ejecutable es server/migrations/010.sql.

## Regla cotidiana definitiva

**Un concepto recurrente → un importe mensual → un lápiz para cargarlo o corregirlo.**

Sin registro: `$ —`. Primer guardado: crea un único gasto. Corrección posterior: UPDATE del mismo ID, sin crear otro gasto ni modificar otro período. Ejemplo ilustrativo del propietario: cargar 505.000 y corregir a 525.000 cambia el importe del mismo registro; estos números no son defaults ni datos a insertar.

El lápiz no abre un gestor de varios movimientos en el uso normal. La propuesta anterior de «varios movimientos como flujo habitual» queda reemplazada por esta definición. Los históricos múltiples son una excepción bloqueada para edición automática y se tratan en el procedimiento separado descrito debajo.

## Configuración y visibilidad transversal

Los ocho conceptos iniciales de esta instalación son Alquiler, Expensas, Luz, Gas, Internet, Agua, Impuestos y Cobertura médica. Se configuran una única vez y la consulta parte del catálogo activo, no de categorías o gastos existentes en el mes.

**Los ocho tiles aparecen al elegir cualquier período existente**, anterior a 010, actual o creado después; abierto o cerrado. LEFT JOIN conceptual desde catálogo hacia la categoría del período y su gasto. Ausencia de categoría o movimiento devuelve importe ausente, no cero. Leer períodos no crea categorías ni movimientos. Un período inexistente devuelve error, no se crea.

Cobertura médica es el servicio Emerger que protege a participantes del espacio: gasto operativo del emprendimiento, no gasto personal. Impuestos representa las obligaciones registradas allí por el emprendimiento. Estas aclaraciones son semántica de configuración para PRISMA, no reglas que obliguen a otras instalaciones.

| Orden | Concepto de PRISMA | icon_name / Lucide         |
| ----- | ------------------ | -------------------------- |
| 10    | Alquiler           | `house` / House            |
| 20    | Expensas           | `building-2` / Building2   |
| 30    | Luz                | `zap` / Zap                |
| 40    | Gas                | `flame` / Flame            |
| 50    | Internet           | `wifi` / Wifi              |
| 60    | Agua               | `droplets` / Droplets      |
| 70    | Impuestos          | `landmark` / Landmark      |
| 80    | Cobertura médica   | `heart-pulse` / HeartPulse |

La migración crea el catálogo vacío. La instalación PRISMA dispone de una acción explícita de configuración que selecciona/agrega esos ocho conceptos y sus iconos, sin importes ni períodos. Si el catálogo no está vacío, la acción se rechaza sin modificarlo: se revisan y administran los conceptos existentes por ID. No seed universal. Administrar nombre/orden/icono/activo es independiente del período; allowlist compartida de iconos y Receipt genérico como respaldo, sin SVG/código de usuario.

Los ocho permanecen activos salvo cambio explícito de configuración. Desactivar un concepto retira únicamente su casillero vacío sin vínculo; si el período tiene categoría vinculada, conserva consulta y datos. Renombrar el concepto no cambia categorías existentes: la etiqueta mensual se conserva en el tile vinculado, con el nombre vigente en el detalle si difiere. Vínculos por ID, nunca por texto.

## Interacción y fecha del gasto

| Situación                             | Lápiz                                                 | Guardado futuro                            |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Sin gasto                             | Registrar importe del concepto en el período          | INSERT de un registro marcado como mensual |
| Un gasto vinculado                    | Editar importe ya registrado                          | UPDATE del mismo ID                        |
| Período cerrado                       | Visible, deshabilitado y con explicación accesible    | Requiere reapertura explícita              |
| Históricos múltiples o inconsistencia | Abrir aviso de revisión histórica, sin input de total | Ninguna corrección automática              |

En la primera carga: importe obligatorio, fecha del gasto explícita y notas opcionales. La fecha se deja **sin completar**, también en períodos antiguos; el usuario debe elegir una fecha válida del gasto dentro del mes. No usar el día 1, el fin de mes ni la fecha actual como reemplazo silencioso. La UI la denomina «Fecha del gasto», no «Fecha de pago»; el registro no acredita pago ni incorpora una fecha de pago inexistente.

Si la información disponible es solo una fecha de pago de otro mes, no trasladarla ni cambiarla automáticamente para satisfacer D005. Revisar el comprobante/criterio de imputación y completar una fecha del gasto sustentada dentro del período. Sin fecha válida confirmada no guardar; preservar el período y explicar el requisito.

Al corregir, el formulario trae el ID/importe existentes y conserva fecha, concepto y notas. Cambiar solo el importe actualiza solo ese importe (más el updated_at normal), sin inventar otra fecha ni borrar notas. Los otros campos pueden corregirse expresamente dentro de las reglas actuales; no cambian como efecto del lápiz o del mes seleccionado.

Guardar invalida las queries actuales de Gastos y Estadísticas y muestra la respuesta del registro confirmado. Mientras se guarda, el botón no permite un segundo envío; cambiar de período no debe asociar la respuesta anterior al nuevo mes. La corrección nunca se implementa como delete+insert.

La representación de cero sigue siendo `$ 0,00` para históricos válidos. Los nuevos gastos conservan la validación positiva del modelo actual; no se crean movimientos de cero por defecto ni se cambia silenciosamente su CHECK económico.

## Ajuste de esquema para un único registro mensual

La unicidad de `period_expense_categories(period_id,recurring_concept_id)` garantiza una categoría por concepto/mes, **pero no limita sus movimientos**. Se complementa con:

1. `period_expenses.recurring_single BOOLEAN NOT NULL DEFAULT FALSE`: marca el registro mensual canónico; no contiene un importe.
2. `recurring_single_category_id`: columna generada VIRTUAL que vale category_id cuando el marcador es true, y NULL en históricos/adicionales no marcados.
3. UNIQUE sobre esa clave generada: solo un movimiento marcado por categoría; junto al UNIQUE del período/concepto, solo uno canónico por concepto y mes.
4. CHECK del booleano; FK de category_id ya existente y FK categoría → concepto se conservan. No se agrega CHECK sobre category_id ni se altera su cascada.

Se usa una clave VIRTUAL, no STORED, por las restricciones de MySQL sobre columnas base de claves foráneas con acciones referenciales. [Columnas generadas MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/create-table-generated-columns.html), [índices UNIQUE virtuales](https://dev.mysql.com/doc/refman/8.4/en/create-table-secondary-indexes.html) y [restricciones CHECK/FK](https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html).

**Límite explícito:** el índice impide dos registros marcados; no prohíbe por sí solo INSERT manual sin marcador. La regla completa del sistema exige las validaciones transaccionales siguientes en todas las rutas de escritura. No afirmar que un UNIQUE de categorías, un conteo frontend o este marcador solos garantizan toda la cardinalidad histórica.

No se incluyen triggers, procedimientos, tablas nuevas de importes ni sumas duplicadas. Ninguna fila histórica se marca o reclasifica durante 010: los campos nuevos quedan como metadatos no seleccionados, conservando todos los valores originales.

### Servicio único y protección de todas las rutas de Gastos

La implementación local centraliza el guardado mensual en PUT del recurso período/concepto, bajo peopleTransaction:

1. Validar período existente/abierto, concepto y payload; bloquear período, concepto y categoría en orden fijo, y leer sus movimientos actuales con locking reads.
2. Sin categoría: comprobar conflictos de nombre y pedir reutilización explícita si corresponde. Si no hay conflicto, crear categoría/vínculo y único gasto con recurring_single=1 en una transacción. Cancelación/fallo revierte todo.
3. Con cero movimientos: insertar uno marcado. Con uno canónico: UPDATE por ID. Con uno histórico sin marcar: solo después de vínculo explícito y revisión, marcarlo preservando updated_at en esa operación de asociación; una corrección monetaria posterior sí actualiza su timestamp normal.
4. Con más de un registro, o marcador/vínculo incoherente: responder 409/estado de revisión y no modificar ningún movimiento ni crear otro. El conteo no se decide en React.
5. Los endpoints genéricos actuales no pueden quedar como vía alternativa: POST de gastos en categoría recurrente se rechaza con indicación de usar el casillero; PUT/DELETE se derivan al mismo servicio o validan el registro canónico bajo idénticos locks. No se permite cambiar/borrar el marcador desde un body de usuario ni trasladar el registro a otro período/categoría.
6. Asociación/desasociación de categorías debe usar el mismo bloqueo y validar movimientos/marcador; ninguna operación puede dejar un marcador huérfano de concepto. Ante varios históricos, la asociación puede quedar explícitamente en revisión sin seleccionar un registro como canónico.
7. El UNIQUE respalda la concurrencia. Dos primeras cargas no crean dos registros: repetición idéntica puede devolver el registro ya confirmado; intención diferente basada en estado ausente devuelve 409, sin sobreescribir silenciosamente la carga ganadora. Para correcciones, comparar ID y valores anteriores esperados además del bloqueo; rechazar formulario desactualizado antes del UPDATE.

Una escritura SQL administrativa fuera de estos servicios no se presenta como operación garantizada del producto. Si introduce registros no marcados en una categoría recurrente, la siguiente lectura detecta la inconsistencia y bloquea la edición automática; no oculta ni descarta esos importes.

## Históricos: asociación y regularización segura

010 no presupone qué categorías representan Alquiler, Emerger o Impuestos: no vincula por coincidencia de nombres. Se revisan período, categoría por ID y sus movimientos antes de asociar. Períodos cerrados se pueden consultar; cualquier asociación o corrección que escriba datos exige reapertura explícita.

- Sin registros históricos: tile `$ —`, sin fabricar un movimiento.
- Exactamente uno: vincular categoría y concepto por decisión humana; marcar ese mismo registro como canónico, sin cambiar ID, fecha, importe, concepto, notas, legacy_advertising_id ni timestamps económicos. La operación de asociación usa updated_at=updated_at para no simular una corrección de importe.
- Varios: preservar todas las filas y sus importes originales. Si la asociación es inequívoca y se autoriza, mostrar suma histórica de lectura con estado «Revisión pendiente»; lápiz abre explicación, no un gestor habitual ni un total editable. Esos registros siguen en Estadísticas una sola vez.
- Varias categorías potenciales para el mismo concepto: no elegir una ni fusionarlas; presentar inventario para revisión. Hasta resolver, quedan en adicionales sin duplicación, y el tile permanece sin registro asociado.

Procedimiento excepcional: inventariar/exportar IDs y campos originales, conciliar contra documentación del gasto, revisar con Hernán y decidir por registro. Si son varios gastos legítimos, **conservar el período como excepción histórica de consulta**; no crear un gasto adicional con la suma ni forzar una consolidación para uniformar el UI. Los otros meses siguen usando el flujo simple.

Si se confirma un error/duplicado, cualquier corrección o eliminación debe autorizarse por IDs y hacerse expresamente con el período reabierto y evidencia previa conservada. No se programa fusión/borrado masivo. Solo después de quedar un único registro correcto se puede seleccionarlo como canónico y habilitar el lápiz simple. Una revisión sin resolución no altera datos.

## Compatibilidad y diseño visual

Se mantienen las ocho tarjetas aprobadas: Lucide, nombre, lápiz cuadrado de 44×44 px con borde/icono #78CBB2, importe destacado, sin franjas de color, párrafos ni repetición mensual por tile. Ocho columnas cuando hay espacio legible, cuatro en desktop intermedio, dos en mobile y una en el ancho mínimo. Cerrado: lápices presentes deshabilitados con explicación accesible; importe abre consulta.

Cobertura de todos los períodos proviene del catálogo; no se crea una categoría por cada casillero vacío. Gastos adicionales conserva su CRUD y muestra únicamente categorías sin vínculo recurrente. Una categoría vinculada o en revisión asociada aparece solo en recurrentes.

| Regla / módulo   | Conservación                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| D004             | No crear períodos implícitos                                                                                    |
| D005             | Fecha del gasto confirmada dentro del período, no fecha de pago inventada                                       |
| D006             | Catálogo transversal no crea categorías ni movimientos automáticamente                                          |
| D007             | Cerrado consulta, escritura solo tras reapertura                                                                |
| Estadísticas     | Misma suma period_expenses vía categorías; ni doble cómputo del canónico ni exclusión de históricos no marcados |
| Clonación        | No copiar categorías, vínculos, marcadores ni gastos; catálogo global disponible sin importes                   |
| Datos históricos | Ningún backfill, fusión, cambio de fechas/importes/notas o ID durante la migración                              |

## DDL oficial 010.sql

La propuesta fue revisada e instalada como [server/migrations/010.sql](../../server/migrations/010.sql). Aplicada y registrada solo en prisma_test (MySQL 8.4.11), con respaldo previo, recuperación de DDL parcial y reejecución completa aprobadas. No contiene seed ni backfill económico. 001–009 permanecen inmutables. Ver preflight, postflight y recuperación en el cierre técnico.

Antes de una ejecución autorizada: host/DB_NAME y SELECT DATABASE() inequívocos en prisma_test, inventario de columnas/índices/FK y copia de todos los campos originales con conteos/sumas por período. No asumir rollback de DDL MySQL. Validar reintentos tras cada paso, equivalencia de datos y todas las rutas de escritura antes de registrar la migración. No autorizar aquí operaciones en ninguna base.

## Maqueta de interacción final

`tmp/expenses-reorganization-preview.html` es demostración local, sin APIs ni persistencia. Permite probar períodos históricos/futuros ilustrativos, carga y corrección del mismo registro en memoria y un caso excepcional histórico bloqueado. No guarda ni crea datos de negocio; al recargar se reinicia.

El caso cotidiano simula cargar/corregir manteniendo un solo ID; no ofrece agregar un segundo movimiento. La fecha empieza vacía en la carga y se conserva en la corrección. Guardar indica de forma explícita «solo maqueta». Cambiar de período deja importes independientes; los ocho tiles permanecen disponibles.

## Pruebas previstas después de autorizar

- Crear y corregir importe: mismo ID, un registro, no INSERT en la segunda operación; preservar fecha/notas al cambiar solo importe.
- Doble clic, reintento de solicitud, dos primeras cargas simultáneas y edición desactualizada: sin duplicados ni pérdida silenciosa.
- Intentar segunda alta por endpoints genéricos y otro registro marcado por SQL: rechazo correspondiente; detectar una inserción no marcada excepcional sin ocultarla.
- Vínculo histórico con cero/uno/varios registros, ambigüedad de nombre y categoría, inventario de todos los campos antes/después; ningún backfill.
- Catálogo visible en períodos anteriores a 010 y futuros existentes; ausencia frente a cero histórico válido; sin creación al leer/clonar.
- Fecha explícita, fecha de pago de otro mes, cambio de período con formulario abierto, cerrado/reapertura y respuestas tardías.
- Marcador/clave virtual UNIQUE/CHECK y FK existentes, reintentos DDL parciales y metadata MySQL 8.4; base exclusiva prisma_test con preflight.
- Totales en Gastos/Estadísticas idénticos al sumar los mismos IDs, incluidos históricos no marcados; sin duplicar publicidad o facilitadores.
- Responsive, lápiz accesible y estado excepcional claramente distinto del uso normal.

## Registro histórico de comprobaciones del prototipo (anterior a implementar)

Comprobaciones estáticas aprobadas: JavaScript de la maqueta compila sin ejecución y carece de red/almacenamiento; SQL de 49 sentencias idéntico al bloque canónico, sin DML de negocio, con clave virtual/marcador/UNIQUE/CHECK y fuera del runner. Revisión visual en 320/390/700/701/1024/1440/1920 px sin scroll horizontal y ocho tiles. Simulación de carga 505.000 y corrección a 525.000 conservó el mismo ID 101, un solo movimiento, fecha 2026-12-10 y notas; cambio al período futuro mostró ausencia y al volver se conservó el importe de diciembre. El período anterior cerrado mostró ocho guiones y lápices deshabilitados. La excepción histórica conservó dos IDs/importes con total solo de lectura, cero inputs y ninguna acción de edición. Diff check aprobado. Estas pruebas son únicamente del prototipo, no de la aplicación ni de MySQL. No SQL, migraciones, datos DB, implementación operativa, dependencias, tests funcionales, commits ni publicación. Las validaciones previas de la aplicación no validan este DDL nuevo.

El diseño simple sustituye la propuesta anterior de múltiples movimientos cotidianos. Los puntos que requieren revisión antes de implementar son la solución técnica de marcador + servicio transaccional en todas las rutas, el estado excepcional para históricos múltiples legítimos y la fecha explícita en la primera carga. La regla de importes positivos nuevos se mantiene; si se requieren nuevos ceros, debe definirse expresamente aparte.

La autorización posterior habilitó la implementación local y 010 solo en prisma_test. El registro de prototipo anterior queda superado por el cierre técnico enlazado al inicio; Estadísticas/IPC permanecen preservados. Detenerse después de las validaciones locales; esperar revisión antes de configurar PRISMA en prisma_dev o aplicar en producción; 010 ya fue aplicada en prisma_dev con autorización posterior.
