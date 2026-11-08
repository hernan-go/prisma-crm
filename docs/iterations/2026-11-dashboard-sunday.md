# Corrección independiente — Dashboard domingo

Implementada localmente el 08/11/2026 y consolidada para commit local autorizado, separado de identidad 12.1 (`2b0ddb8`). Sin publicación.

Dashboard conserva domingo=0 como día real, agrega domingo después de sábado al selector y permite selección manual de los siete días. Antes `date.day || 1` adelantaba domingo al lunes; ahora usa `chosenDay ?? date.day`. Sin actividades para el día actual del período actual muestra «No hay actividades programadas para hoy». Períodos históricos/futuros conservan el contexto mensual y el mensaje de vacío específico del período. Sin cambios de esquema, horarios, inscripciones, economía ni Eventos.

Representación comprobada: contratos shared y CHECK de 005 admiten 0–6. No se detectaron otras sustituciones de cero en el modelo usado por Dashboard. CSS existente flex-wrap admite siete botones, sin cambios de estilos.

Tests usan reloj explícito (solo Date), restaurado tras cada prueba. Incluyen domingo con/sin clases, contexto histórico, fecha/título coherentes y lunes a sábado. Fixture QA sintético `http://localhost:5173/tests/browser/dashboard-sunday.html` y `?empty`, sin Express/MySQL ni credenciales. Fecha congelada solo dentro del fixture, conservando constructores de Date con argumentos.

Validación: 34 focalizadas aprobadas (Dashboard + identidad + auth). Suite general final: 593 aprobadas, cero fallidas, 218 omitidas. Typecheck/lint/build aprobados, avisos conocidos de Zod/Rollup; diff-check aprobado. Los dos fallos anteriores se reprodujeron en copia aislada de 1d0d402 el domingo y aprobaron el lunes, antes de esta corrección.

QA de navegador integrado: selección manual lunes → domingo actualiza tarjeta y aria-pressed; domingo vacío muestra el texto aprobado. Se solicitaron tamaños 390×844, 768×1024 y 1440×900, pero las capturas mostraron escalado/recorte de la herramienta: no equivalen a validación exacta de esos viewports. Medición DOM móvil efectiva: innerWidth 309, scrollWidth 298, los siete botones dentro del ancho; captura móvil legible. No se acredita QA completa de tablet/escritorio ni lector de pantalla. Revisión manual recomendada en Chrome/Edge con DevTools a 390×844, 768×1024 y 1440×900 usando el fixture; pulsar lunes/domingo y abrir ?empty. Clima no disponible es intencional en el fixture.

Vite inicial aislado no fue accesible por HTTP; se detuvo y se inició fuera del sandbox, HTTP 200 de la URL exacta verificado antes del navegador. Ningún cambio de firewall, CORS, credenciales o producción.
