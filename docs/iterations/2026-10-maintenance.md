# Iteración 7 — Mantenimiento

**Fecha:** 2026-10-20. **Rama:** `codex/iteration-7-maintenance`, desde `main` en `e13f9525a3a067751dc2434b5dd4dbd86b750024`, inicialmente limpio y coincidente con GitHub.

## Objetivo y cambios efectivos

- Regularizar el cierre productivo de la iteración 6 en PROJECT_STATE, ROADMAP y su documento, exclusivamente según confirmación del propietario. Se conservan los registros anteriores identificados como históricos.
- Investigar el header global y corregir únicamente el desborde reproducido: `.desktop-header` permite salto de fila y altura adaptable con mínimo de 88px. Sin ocultar overflow ni cambiar controles, componentes o reglas de negocio.
- README: sustituir el arranque MySQL portátil por Community Server 8.4.11, servicio `MySQL84`, `127.0.0.1:3306`, bases dev/demo/test y scripts privados vigentes. Sin cambios de configuración ni credenciales publicadas.

## Investigación responsive

Navegador local con App y CSS reales, respuestas API ficticias para septiembre 2026 cerrado (nombre largo) y octubre 2026 abierto. Página temporal aislada en `tmp/`, sin backend ni DB; todas las escrituras y solicitudes inesperadas bloqueadas. Vite sirve solo frontend en puerto 5174. Inspección visual y medición DOM antes/después, con barra vertical de 15px:

| Viewport | Ancho útil | Documento antes | Documento después |
| -------- | ---------- | --------------- | ----------------- |
| 390      | 375        | 375             | 375               |
| 700      | 685        | 685             | 685               |
| 701      | 686        | 743             | 686               |
| 768      | 753        | 753             | 753               |
| 1024     | 1009       | 1009            | 1009              |

Resultados iguales al seleccionar ambos períodos: el ancho intrínseco del select depende también de sus opciones no seleccionadas. A 701px, breadcrumb y controles sin salto de fila excedían el header: controles hasta x=742,625, frente al borde x=686 del header. Dashboard dentro de su contenedor. Tras el ajuste, sin overflow horizontal en los diez casos; controles accesibles, header en dos filas cuando hace falta y composición mobile preservada. Capturas observadas en el navegador para los cinco anchos y el caso cerrado a 701px. Apertura/cierre del menú mobile a 390px y sidebar contraído a 701px también comprobados, sin overflow horizontal. Evidencia acotada a estos fixtures y al navegador disponible; no constituye auditoría de todas las pantallas o navegadores.

La suite existente usa Vitest en Node, sin motor de layout ni runner responsive configurado. Regresión comprobada en navegador mediante la matriz anterior; no se agregó una prueba estática de CSS que no pudiera detectar overflow real ni dependencias nuevas.

## Validaciones

Prettier ejecutado una vez sobre los seis archivos afectados. Typecheck, lint, tests sin integración DB (162 aprobados, 157 omitidos), build y `git diff --check` aprobados. Vitest falló inicialmente antes de ejecutar casos por EPERM al renombrar temporales dentro del sandbox; reintento fuera del sandbox aprobado. Build con los warnings no bloqueantes conocidos de comentarios Zod/Rollup. Sin suites DB, migraciones ni consultas productivas. Servicio `MySQL84` comprobado activo mediante consulta de solo lectura fuera del sandbox; scripts privados revisados para confirmar selección dev/demo. Página QA retirada y servidor temporal detenido al cierre.

## Estado final y pendientes

Mantenimiento local pendiente de revisión del propietario e integración/publicación manuales. Sin push, merge, migraciones, datos modificados ni operaciones productivas. README conserva otras referencias históricas al despliegue y a repositorio privado, fuera del alcance autorizado de actualización MySQL. No se inició Estadísticas.

## Nueva fase — Horarios no vigentes en Configuración

Continúa la iteración 7 en la misma rama, conservando `dd7dda2`; la iteración permanece abierta. Los horarios habilitados conservan su orden y visibilidad incluso sin inscriptos. Los deshabilitados se agrupan al final de cada oferta en `Horarios no vigentes (N)`, cerrado por defecto y ausente si está vacío. Se reutilizan la fila y controles existentes, con `details/summary` nativo y área táctil ampliada. Edición, reactivación, borrado permitido e historial mantienen sus mecanismos actuales; períodos cerrados conservan controles bloqueados. Sin cambios de backend, DB, reglas de negocio, Dashboard o Agenda.

Validaciones aprobadas: Prettier sobre los cuatro archivos afectados, typecheck, lint, cinco pruebas nuevas de renderizado y suite completa sin DB (167 aprobadas, 157 integraciones omitidas), build y diff check. Las nuevas pruebas cubren clasificación por active (booleano o 0/1), contador, orden, cero inscriptos, todos habilitados/deshabilitados, sin horarios, eliminación según uso y controles bloqueados en período cerrado. Vitest requirió reintento fuera del sandbox por EPERM de temporales; build conserva los warnings conocidos de Zod/Rollup.

QA en navegador con App, Configuración y formulario reales, API simulada exclusivamente en memoria y sin backend/DB. Escenarios mixto, todos habilitados y todos deshabilitados; capturas observadas en 390, 768 y 1366px con documento igual al ancho útil (375, 753 y 1351px). Expansión por mouse y Enter, contracción por Espacio y foco visible comprobados. La edición de un horario histórico conserva día/horas/facilitadores bloqueados y permite reactivarlo: tras guardar en memoria vuelve al listado principal y el contador pasa de 2 a 1. Edición de una actividad con todos sus horarios deshabilitados accesible. Cambio a período cerrado: consulta del grupo permitida, edición y eliminación bloqueadas; al cambiar período el desplegable vuelve cerrado. Sin borrados durante QA. Evidencia limitada al navegador y fixtures utilizados; pendiente prueba local del propietario con sus datos. Página sintética y servidor temporal retirados después de QA.

Preparación para revisión local: `private/run-dev.ps1` selecciona `prisma_dev` y ejecuta `npm run dev`; este inicia Express y Vite, sin migraciones, seed ni limpieza automática. Abrir `http://localhost:5173` tras iniciar el script si el CRM no está activo. Pendiente revisión visual del propietario; sin integración a main ni push.

## Nueva fase — Rediseño visual de actividades del período · 2026-10-21

El propietario aprobó la funcionalidad anterior con pruebas sintéticas locales, incluida edición, deshabilitación, reactivación y eliminación permitida. Se conservan `dd7dda2` y `9750cf1`, en la misma rama y con la iteración abierta. Esta fase modifica exclusivamente presentación del bloque: clases específicas en JSX y CSS limitado a `.period-offerings`, sin cambios de lógica, formularios ni controles de otras pantallas.

Títulos de actividad de 20px sin etiqueta blanca; horarios de 14px, metadatos de 12px y días de 10px. Tarjetas y filas más compactas, acciones secundarias de 32px en desktop y mínimo de 44px en mobile o puntero táctil. Las acciones destructivas conservan tono rosado y condiciones existentes. Píldora dorada de 28px visuales, ancho al contenido, flecha según apertura y área interactiva de 44px; sin margen inferior adicional del desplegable cerrado. Contraste texto/fondo de la píldora medido en 6,98:1.

QA con App, CSS y formulario reales en página local aislada, API sintética en memoria sin backend/DB. Escenarios: nombre largo, varios facilitadores, uno/múltiples horarios, mezcla de estados, todos deshabilitados, oferta/horarios eliminables y período cerrado. Capturas revisadas con desplegable cerrado y abierto; teclado Enter/Espacio, edición desde no vigentes y bloqueos de período cerrado conservados. Anchos 390/700/701/768/1024/1366px: sin overflow horizontal, documento igual al ancho útil de 375/685/686/753/1009/1351px. Sin solapamientos observados; se revisaron jerarquía, acciones y espacio inferior. Evidencia limitada al navegador y fixtures utilizados, pendiente aprobación visual del propietario en localhost.

Prettier ejecutado una vez sobre los tres archivos afectados; typecheck, lint, suite completa sin DB (167 aprobadas, 157 integraciones omitidas), build y diff check aprobados. Las cinco pruebas de Configuración existentes siguen aprobadas sin cambios. Vitest se ejecutó fuera del sandbox por el EPERM de temporales conocido; build conserva solo los warnings conocidos de Zod/Rollup. Página sintética retirada y servidor temporal detenido al cierre. Sin dependencias nuevas, backend, datos modificados, migraciones, merge ni push. Versión preparada para iniciar con `private/run-dev.ps1`; pendiente revisión visual del propietario y la iteración 7 no se cierra.

## Nueva fase — Unificación UX/UI de Configuración · 2026-10-21

Se conservan `dd7dda2`, `9750cf1` y `470a0a7`. Se recupera la píldora blanca de actividades a 20px y se mantienen las píldoras azules de facilitadores y doradas de horarios no vigentes. Las cuatro secciones comparten densidad, separadores y acciones compactas: edición con borde/fondo visibles, eliminación con borde rojo apagado y hover rojo oscuro; tres altas principales con idéntico tratamiento turquesa. Mínimo táctil de 44px en mobile/puntero grueso, foco visible existente de 2px. CSS específico de Configuración; selectores de botones directos excluyen formularios y confirmaciones. JSX de Períodos cambia únicamente clases, sin reglas ni eventos nuevos.

QA con las cuatro secciones completas, nombres largos, estados activo/archivado, facilitadores activos/inactivos, varios horarios, eliminación permitida y períodos abiertos/cerrados. Capturas completas revisadas en 390, 700, 701, 768, 1024 y 1366px; sin overflow ni botones fuera del viewport. Se corrigió alineación desigual de acciones de Períodos en tablet estrecha (701–900px). Píldora blanca y colores originales de facilitadores verificados mediante estilos computados. Altas principales con colores y dimensiones idénticos; bordes de edición y eliminación reforzados tras medir su contraste. Hover real comprobado en edición, alta, eliminación y cierre/reapertura abriendo/cerrando modales sin confirmar operaciones; foco de teclado y mínimo táctil de 44px comprobados. Desplegable cerrado/abierto y consulta en período cerrado conservados. Todo con API ficticia en memoria y escrituras bloqueadas, sin backend/DB.

Prettier aplicado una vez a los cuatro archivos afectados; typecheck, lint, suite sin DB (167 aprobadas, 157 integraciones omitidas), build y diff check aprobados. Las pruebas funcionales existentes se conservan sin cambios. Vitest fuera del sandbox por el EPERM de temporales conocido; build solo con warnings conocidos de Zod/Rollup. Entorno de QA retirado y servidor temporal detenido. La iteración sigue abierta, pendiente aprobación visual del propietario en localhost mediante `private/run-dev.ps1`. Sin cambios productivos, merge ni push.
