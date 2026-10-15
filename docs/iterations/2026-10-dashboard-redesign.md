# Iteración 6 — Nuevo Dashboard

**Fecha:** 2026-10-15. **Base verificada:** `c20b451707a6f19b8a01a759c6a7c58627d70bf1`, main y origin/main coincidentes tras fetch. Working tree inicial limpio.
**Rama:** `codex/dashboard-redesign`. Implementación local; sin push, merge, despliegue ni cambios productivos.

## Alcance implementado

Dashboard extraído de App a `client/Dashboard.tsx`, con estilos acotados en `client/dashboard.css` y transformación/fecha en `client/dashboard-model.ts`. App conserva navegación y selección global del período. Sin cambios a backend, contratos, cálculos, dependencias, esquema ni migraciones.

- Operación a izquierda y administración a derecha cuando hay ancho suficiente; una columna hasta 1200px. KPIs 2×2 o cuatro en línea según el ancho real de su contenedor. Carteras y saldos contiguos desde 570px disponibles, siempre apilados en mobile.
- Fecha y hora actuales en es-AR, zona `America/Argentina/Cordoba`, formato 24h sin segundos. Timer alineado al minuto, recalculado al recuperar visibilidad y limpiado al desmontar. Cambiar de minuto no consulta APIs.
- `/api/agenda?period_id=…` y `/api/dashboard?period_id=…` en queries independientes y claves por período. Sin datos del período anterior como placeholder. Carga, errores, reintentos y actualización separados.
- Programación del día semanal actual dentro del período seleccionado. Se filtran período, día, horario activo, oferta activa y catálogo activo, conforme a vigencia existente. Se conservan tarjetas con cero inscriptos, distintos horarios y snapshots de facilitadores. Personas y facilitadores se deduplican por ID; orden por inicio, actividad e ID.
- Período actual: «Actividades de hoy». Otro período: «Programación de los jueves» (día correspondiente) con período explícito. No afirma asistencia ni clase efectivamente realizada. Períodos cerrados conservan lectura; no hay escrituras ni creación implícita.
- Hasta 700px, nombres inicialmente contraídos con control accesible; desde 701px visibles. Enlaces existentes `/personas/:id`, nombres completos y sin scroll interno.
- «Total inscriptos período» conserva personas únicas de membresías; «Inscripciones en actividades» conserva inscripciones del backend. Ayudas con botón de 44px, símbolo discreto #78CBB2, teclado/touch, cierre explícito, Escape, foco y clic externo.
- Carteras por receptor/medio, NULL vs cero, saldos y gráfico CSS se conservan sin recálculo frontend. Gráfico al final.

## Clima: pendiente por alcance aprobado

Widget muestra «Rosario, Santa Fe / Clima no disponible», sin temperatura, geolocalización ni solicitudes externas. Se aplicó la excepción aprobada para no forzar una integración secundaria.

Fuentes oficiales consultadas el 2026-10-15:

- [Open-Meteo: condiciones](https://open-meteo.com/en/terms) y [planes](https://open-meteo.com/en/pricing): API libre limitada a uso no comercial; licencia comercial requiere suscripción y clave. No se asumió que PRISMA califique como no comercial.
- [MET Norway: HOWTO](https://api.met.no/doc/locationforecast/HowTO): desaconseja consultas directas del navegador en producción, exige identificación y tratamiento de caché. Aunque admite uso comercial, adoptarlo correctamente requeriría un proxy/cache backend adicional; se postergó para mantener esta iteración en frontend y endpoints existentes.

No se afirma que no existan otros proveedores. Integrarlo luego requiere elegir explícitamente un proveedor y su mecanismo de acceso; no se contrató ningún servicio.

## Validación

Prettier ejecutado una sola vez sobre los 15 archivos compatibles modificados. Typecheck, lint y build aprobados; tests: 126 aprobados y 157 integraciones DB omitidas, incluidos 9 casos nuevos de Dashboard. `git diff --check` aprobado. Tests y build se reintentaron fuera del sandbox por EPERM de Vite; build con los warnings conocidos de comentarios Zod/Rollup, sin errores. No se ejecutaron suites DB ni migraciones.

Cobertura focalizada: fechas argentinas, domingo/medianoche, período actual/histórico/futuro, filtros de vigencia/período/día, horarios vacíos y múltiples, deduplicación, métricas financieras sin recálculo, estados independientes de error/carga, ausencia de período, enlaces completos, listas inicialmente contraídas y respuestas tardías al cambiar período.

QA visual ejecutada con navegador sobre una página temporal aislada en `tmp/`, ignorada por Git y ajena al entry point/build del CRM. Query cache con fixtures exclusivamente de QA, sin escribir en DB. Inspección de 390, 700, 701, 768, 1024, 1366 y 1920px efectivos (medidos con innerWidth para compensar escala del sistema). Sin desbordamiento horizontal del documento observado. Nombres largos, dos facilitadores, horario vacío, expansión/contracción mobile, ayudas, cierre con Escape y foco verificados. Se observó actualización del reloj por minuto. Selector actual/histórico cerrado/futuro vacío verificado en este entorno aislado. No se simuló visualmente una cifra de máximo DECIMAL ni el cruce real de medianoche; la fecha límite se cubre en test.

El acceso real a localhost funciona pero requiere contraseña. No se ingresaron credenciales ni se hizo smoke autenticado con datos reales; queda para la revisión final del propietario. No se ejecutó integración destructiva: cambios exclusivamente frontend/documentación.

## Cierre y revisión final

Las tres iteraciones anteriores (mobile, quitar cuenta mensual vacía y configuración eliminable) están integradas, desplegadas y aprobadas en producción, según confirmación explícita del propietario en el pedido. Noviembre 2026 creado por error fue eliminado satisfactoriamente. No se repitió auditoría ni acceso productivo.

Abrir `http://localhost:5173`, iniciar sesión y revisar Dashboard, selección de períodos y mobile. Si el servidor no está activo, ejecutar `.\private\run-dev.ps1`. Push e integración a main quedan manuales después de aprobación del propietario.

## Corrección fina posterior — 2026-10-15

Ajuste aprobado tras revisión manual, sobre la misma rama: cabecera operativa en dos tiles (día/actividades y hora/ubicación), seguida directamente por las actividades, sin la línea redundante. Para otros períodos se conserva su identificación y el título de programación semanal. Las personas quedan siempre visibles también en mobile: se retiran el botón y el estado de despliegue. Esta decisión supera el comportamiento contraído descrito en la implementación inicial.

Cada ayuda KPI se posiciona respecto de su propio tile mediante CSS relativo, con alineación adaptable para evitar desbordamiento. Se conservan texto, apertura/cierre, Escape y retorno de foco. No cambia backend, finanzas, cálculos ni clima.

QA en Chrome headless con respuestas API ficticias aisladas del servidor: 1920, 1366 y 390px. Cabecera sin redundancia, nombres visibles, ambas ayudas ancladas al tile correspondiente, Escape/foco y ausencia de overflow verificados; capturas revisadas. No se usaron credenciales ni se modificaron datos reales.
