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

## Integración meteorológica final — 2026-10-15

Implementación sobre `codex/dashboard-redesign`, base limpia `28821d0`. Este cierre reemplaza el pendiente meteorológico de la sección inicial. Se conserva el tile verde y la estructura de dos tiles; en el gris: hora a izquierda y ROSARIO, SANTA FE / icono + temperatura / condición a derecha, siguiendo `111.png`. Mobile conserva el apilado previo. Sin cambios financieros, de esquema, DB, migraciones, claves, dependencias ni despliegue.

### Proveedor, runtime y atribución

- Endpoint fijo HTTPS: `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=-32.9442&lon=-60.6505`.
- User-Agent: `PRISMA-CRM/1.0 (+https://prismacomunidad.com.ar)`. Web pública comprobada en solo lectura: HTTP 200 e información de contacto presente. No se envían datos, coordenadas ni IP del visitante al proveedor.
- Condiciones verificadas: [Terms of Service](https://api.met.no/doc/TermsOfService), [licencia](https://api.met.no/doc/License), [caché y cliente](https://api.met.no/doc/locationforecast/HowTO), [formato de pronóstico](https://api.met.no/doc/ForecastJSON). La atribución visible enlaza MET Norway y CC BY 4.0; indica redondeo/traducción en la ayuda del enlace. Iconos Lucide locales; sin logos Yr.
- Node local v24.21.0: fetch y AbortSignal.timeout disponibles. README, package engines y CI utilizan/permiten Node 24 LTS (también 22.12+). Compatible con el runtime documentado para SiteGround; no se consultó el runtime real ni la conectividad de producción.

### Caché, selección temporal y degradación

`server/weather.ts` expone un router mínimo montado en la API detrás de su autenticación. Devuelve exclusivamente `{weather: snapshot | null}` y no consulta MySQL. Tiempo máximo externo: 5 segundos, incluyendo lectura del cuerpo. Respuesta validada con Zod existente: unidades Celsius, temperatura finita, fechas, serie y resumen meteorológico.

Caché en memoria por proceso del documento completo. Se respeta Expires (considerando Date), Last-Modified y revalidación If-Modified-Since idéntica, nunca futura; 304 conserva el documento y renueva su validación. Sin Expires se usa 30 minutos; expiración ya pasada tiene mínimo de 1 minuto. Se añade hasta 1 minuto de dispersión para no sincronizar consultas externas. Una promesa compartida evita duplicados simultáneos. No hay cron ni solicitudes externas por usuario/minuto; al reiniciar o con varios procesos cada uno mantiene su propio caché.

Se selecciona de nuevo el intervalo en cada GET local, aunque el documento siga cacheado: punto horario anterior al momento actual (máximo 1h), o primer punto futuro a no más de 30 minutos. Resumen del período más corto disponible: 1, 6 o 12h. La temperatura instantánea es una estimación de modelo; no se presenta como observación instrumental. Se redondea a grados enteros, conservando cero y negativos. Se devuelven forecastAt, validUntil, updatedAt y checkedAt. No se reutiliza indefinidamente el primer símbolo; vigencia termina también al llegar al siguiente punto.

Límites conservadores: modelo menor de 12h y caché validado hace menos de 6h. No se sirve información tras una revalidación fallida. HTTP 403 espera 1h; 429 al menos 15min; otros errores/red/timeout/JSON inválido esperan 5min. Retry-After se respeta si solicita una espera mayor (segundos o fecha). Respuestas deprecadas/no 200/304 se tratan como indisponibilidad. La API local conserva 200 con weather null para que una caída externa no afecte las demás rutas ni exponga errores técnicos.

`client/Weather.tsx` usa la clave fija weather/rosario, sin período. Reconsulta cada 15min como máximo o al vencer el intervalo (mínimo 1min), sin polling de pestañas ocultas; al recuperar foco revalida si corresponde. El reloj conserva su timer existente y no dispara fetch por cada render o cambio de período. El frontend oculta temperaturas cuyo validUntil venció y las respuestas fallidas; mantiene hora, ubicación, atribución y «Clima no disponible». Mapeo explícito para sol/noche, nubosidad, lluvia/lluvia ligera, tormentas, niebla, nieve y aguanieve; código desconocido usa icono neutro y «Condición no disponible».

### Comprobaciones y limitaciones

Consulta real del servicio a MET Norway aprobada fuera del sandbox: respuesta válida con temperatura, símbolo, intervalo y actualización; dentro del sandbox había devuelto indisponibilidad. No se cambiaron credenciales ni datos del CRM. Los tests automatizados utilizan respuestas simuladas, sin Internet y sin suites DB.

Revisión visual sobre Chrome headless con fixtures API aislados: 1920, 1366, 1024, 768, 700, 701 y 390px, en éxito y error. Se revisaron las 14 capturas del encabezado: composición, icono/temperatura, descripción, atribución y nombres visibles. Prueba de cambio de período: ninguna solicitud meteorológica adicional. Error meteorológico conserva hora, actividades y finanzas.

Limitación reproducida en 701px: el selector del header global puede desbordar con la opción de período histórico del fixture (documento de 743px para viewport de 701px). Se confirmó el mismo resultado en el build anterior `28821d0`, antes de esta integración. Los tiles meteorológicos permanecen dentro del ancho disponible; no se modificó el shell fuera de alcance. Los otros seis anchos no presentaron desbordamiento del documento.

Validaciones generales aprobadas: Prettier sobre los 12 archivos compatibles modificados, typecheck, lint, 162 tests aprobados (36 nuevos de clima; 157 integraciones DB omitidas), build y git diff --check. Build conserva los warnings conocidos de Zod/Rollup. Conectividad saliente y runtime efectivos de SiteGround quedan para el smoke manual posterior al despliegue autorizado. Memoria/caché se reinicia con el proceso; no hay garantía de disponibilidad del proveedor.

Para revisar localmente: abrir `http://localhost:5173`, iniciar sesión y comprobar el tile gris. La hora sigue avanzando y cambiar de período conserva el clima actual. No hace falta refrescar cada minuto: la query se actualiza por su intervalo y el backend cachea/revalida según el proveedor. En fallo se muestra el estado discreto de indisponibilidad. Sin push ni merge a main.
