# Iteración 10.2 — Etapa 2, interfaz de Eventos Especiales

> Antecedente de implementación. Las reglas funcionales vigentes y validaciones finales están en [reestructuración definitiva](2026-11-special-events-stage-3.md); cupos, reintegros visibles, cinco tarjetas y consolidación anterior quedaron superados.

Implementación local sobre `codex/iteration-10-2-events-stage-1`, preservando los cambios sin commit de Etapa 1. Alcance: frontend y conexión con sus endpoints. No se cambia 014 ni se inicia la asociación de Gastos, consolidación de Carteras, Estadísticas o MCP.

## Entrega

Menú lateral y móvil con Eventos Especiales, ruta `/eventos` y ficha `/eventos/:id`. Selección global de período; cambiarla desde una ficha vuelve al listado. Acceso directo a una ficha de otro período ofrece seleccionar explícitamente su mes antes de escribir. Listado operativo excluye cancelados y checkbox habilita consulta histórica.

Formularios de alta/edición, confirmación/realización/cancelación, reprogramación hacia períodos abiertos existentes, incorporación/edición/baja/reincorporación de participantes. Búsqueda global de Personas y creación dentro del flujo reutilizando PersonForm, con nombre/apellido y teléfono opcional. Se corrige el aviso obsoleto de teléfono obligatorio; callback opcional de alta devuelve la Persona creada sin modificar importaciones ni crear membresías de talleres.

Cobros y reintegros reales individuales con fecha argentina inicial, importe, receptor y medio obligatorios e independientes y notas. Baja no descuenta dinero; reintegros de retirados disponibles en su listado, y en antecedentes cancelados. Anulación de carga errónea con motivo, sin borrar movimientos. Los cálculos comerciales provienen del backend; no se recalculan finanzas en React.

Cinco tarjetas con colores/tokens existentes de Gastos, cinco columnas de escritorio, tres de tablet y dos de móvil. Gastos directos y Recaudado neto muestran «Pendiente de integración», sin ceros ficticios ni fórmula provisional. Cancelados no muestran tarjetas comerciales. Se aclara el carácter estimado y no efectivo del neto futuro. Sección de gastos informativa sin editar Gastos Período.

## Integridad de los envíos

Formularios usan UUID por operación y revisión capturada al abrir. Bloqueo inmediato de doble envío; nunca reintento automático de mutaciones. Una respuesta 409 actualiza la consulta y exige cerrar/revisar el formulario, conservando sus valores. Al fallar red, parseo de respuesta, timeout o 5xx, se conserva en sessionStorage la solicitud exacta, incluyendo clave/revisión, para reintentar incluso después de cerrar modal o recargar la pestaña. Un envío pendiente bloquea nuevas operaciones de Eventos en esa pestaña hasta obtener respuesta definitiva; el backend conserva autoridad entre administradores/pestañas. Si no se puede guardar el recibo local, no se envía. No se almacenan credenciales.

La recuperación puede hacerse dentro del modal o desde listado/ficha. Las respuestas definitivas 4xx (excepto timeout 408) liberan el recibo para corregir; el backend debe rechazar sin aplicar cambios, conforme a sus transacciones. El callback de guardado compartido recibe opcionalmente el resultado para reutilizar la creación de Personas; los consumidores anteriores siguen funcionando.

## Validación y límites

Pruebas de componentes por render React, navegación/rutas, tarjetas, períodos cerrados, cancelados y fecha argentina. Pruebas del cliente con pérdida de respuesta, recuperación persistida, doble clic, rechazo 409 y respuesta 503. Integración aislada del cliente con HTTP/backend en prisma_test extiende la suite de Etapa 1; sin reset ni limpieza general.

Fixture manual sin backend/DB: `/tests/browser/special-events.html`, servida por Vite. Intercepta fetch con datos sintéticos y bloquea destinos no previstos; ofrece simulación de respuesta perdida, conflicto y cierre/reapertura de un período. No usar esta fixture como evidencia de reglas MySQL: estas corresponden a la integración real aislada.

QA visual/interactiva en navegador no completada: el navegador integrado no alcanzó localhost y Computer Use se detuvo al no poder verificar con suficiente confianza la URL de Chrome. No se intentó eludir esa protección. Pendientes comprobación visual responsive e interacción integral de formularios mediante navegador autorizado. No se declara aprobada esa revisión por disponer de CSS o renders estáticos.

Validación local del 02/11/2026: typecheck y lint aprobados; 494 pruebas normales aprobadas, 201 integraciones omitidas por flags; 17/17 casos MySQL aislados aprobados en prisma_test, incluyendo recuperación persistida del cliente tras perder respuesta HTTP posterior al commit, sin duplicar el cobro. La suite preservó hashes de las ocho tablas originales controladas y retiró solo sus fixtures. Build completo aprobado con las advertencias conocidas no bloqueantes Zod/Rollup; git diff --check sin errores. Pruebas nuevas: cinco renders/contratos de componentes y cuatro casos del controlador de envíos. Los renders estáticos no sustituyen QA interactiva ni visual. Servidor Vite de la fixture detenido al cierre.

Sin commits, push, merge, despliegue, dependencias nuevas ni modificaciones a prisma_dev, prisma_demo, producción o MCP. No se modificó código backend en esta etapa. 014 permanece sin cambios; SHA-256 `392bb2e009d3b3d3a7cbd56a51912bceff9aa3c1661e942dbcfb77f7d3222dc3`. Esta entrega parcial no está lista para publicar: faltan Etapas 3 y 4 y autorizaciones posteriores. Interfaz implementada localmente; aceptación visual/interactiva pendiente por el bloqueo de Computer Use descrito arriba.
