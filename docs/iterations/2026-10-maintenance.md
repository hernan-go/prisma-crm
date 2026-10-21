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
