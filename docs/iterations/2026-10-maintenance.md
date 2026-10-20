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
