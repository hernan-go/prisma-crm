# SEC-01 — corrección de seguridad del parser HTTP

Sesión: `PRISMA_2026-11-10_0127_SEC-01_Seguridad-parser-HTTP`.
Fecha: 10/11/2026. Implementación y pruebas locales autorizadas, sin commit.

## Base y resultado

Rama verificada: `codex/iteration-12-identity-foundations`; HEAD `b5040171f222f5bc8bce86eb88818b311877cae4`, working tree inicialmente limpio. Tras `git fetch origin`, nueve commits por delante de origin/main. HEAD y rama conservados.

La exposición identificada queda corregida en el árbol local y en las dependencias instaladas: `body-parser@2.3.0` → `2.4.0`. No se publica esta corrección ni se certifica el servidor productivo. No hubo commit, staging, push, merge, despliegue ni operaciones MySQL.

## Aviso verificado antes de editar

El [aviso GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828), consultado el 10/11/2026, identifica CVE-2026-111181: afecta body-parser `>=2.0.0 <2.4.0` y `<1.20.9`; versiones corregidas 2.4.0 y 1.20.9. Describe una posible excepción no capturada por bytes posteriores a un cuerpo comprimido cuando el decoder ya terminó. El procesamiento puede ocurrir antes de autenticación y de encontrar una ruta.

Se comprobó también la [publicación oficial 2.4.0](https://github.com/expressjs/body-parser/releases/tag/v2.4.0), el código instalado del decoder y la disponibilidad npm mediante `npm view body-parser@2.4.0 version engines dependencies --json`. Requiere Node >=18; entorno de validación Node 24.21.0 y npm 11.19.0, compatible con engines del proyecto. El aviso propone desactivar inflate como alternativa; no es necesario cambiar el soporte de compresión al actualizar a la versión corregida.

## Incorporación y superficie HTTP

`npm ls body-parser express` y `npm explain body-parser` acreditaron una única copia, transitiva: proyecto → Express 5.2.1 → body-parser 2.3.0. Express declara `^2.2.1`; admite 2.4.0. express-rate-limit usa el mismo Express mediante peer dependency. No hay importación directa de body-parser por el proyecto.

Orden de `server/app.ts`: Helmet → router terminal B2 → namespaces terminales AI/propuestas → CORS → `express.json({ limit: '8mb' })` → rate limit general de API → Origin/Fetch Metadata → autenticación → rutas administrativas → 404 → archivos/SPA → manejador global de errores. El JSON global conserva strict e inflate predeterminados: objetos/arreglos JSON, con gzip, deflate y Brotli. El límite se aplica al tamaño descomprimido. El parser global alcanza solicitudes anónimas antes del guard y del límite general; actualizar la dependencia elimina el defecto del decoder sin mover middleware.

B2 emplea URL-encoded de 4 KiB, cuatro parámetros e `inflate: false`, antes del parser global. Propuestas tiene JSON estricto de 4 MiB e `inflate: false`, con manejo de errores propio; AI usa su namespace terminal. La actualización transitiva alcanza también estos usos de Express; no se modificaron sus opciones ni autorización. No hubo cambios de multipart/importaciones, autenticación heredada, Google, UI ni reglas de negocio.

Validación/manejo global existente: Zod → 422; JSON malformado → 400; AppError conserva su status; determinados errores MySQL → 409/422; archivo demasiado grande → 413. `entity.too.large` del JSON global y errores del decoder sin mapeo específico se responden con 500 genérico y un log reducido de código/nombre, sin cuerpo. Se conserva ese comportamiento por el alcance y la restricción de no alterar contratos; no se presenta como un nuevo tratamiento 413/415 ni como otra corrección de SEC-01.

## Cambio mínimo y reproducibilidad

Comando aplicado: `npm update body-parser --ignore-scripts --no-audit --no-fund --fetch-retries=0 --fetch-timeout=10000`. No se ejecutó npm audit fix ni una actualización general. La resolución npm sólo cambió dos paquetes:

| Paquete     | Antes  | Después | Motivo                                                           |
| ----------- | ------ | ------- | ---------------------------------------------------------------- |
| body-parser | 2.3.0  | 2.4.0   | Versión corregida compatible con el rango de Express             |
| qs          | 6.16.0 | 6.17.1  | La versión corregida exige ^6.16.1; npm eligió 6.17.1 compatible |

`qs` continúa deduplicada entre Express/body-parser y superagent; no se actualizaron esos consumidores. Los requisitos nuevos de content-type e iconv-lite ya estaban satisfechos por las versiones fijadas. package.json y sus overrides previos permanecen intactos; no se agregan dependencias directas ni overrides. El lockfile fue generado por npm, con versiones, URL e integridad nuevas; no se editó manualmente. `npm ls` y `npm explain` finales confirman Express 5.2.1 → body-parser 2.4.0, sin otra copia vulnerable instalada. La instalación posterior debe respetar el lockfile con npm ci. No se ejecutó una reinstalación limpia con npm ci en esta intervención.

## Pruebas y evidencia

Nuevo archivo `tests/http-parser.test.ts`, sin DB ni servicios externos, con credenciales sintéticas y sesiones en memoria. Las pruebas de aplicación usan createApp real, con integraciones deshabilitadas explícitamente, HTTP nativo en puertos efímeros loopback y cuerpos binarios sin serialización intermedia de superagent:

- Login JSON correcto sin compresión y con gzip, deflate y Brotli: cuatro casos 200.
- JSON malformado anónimo: 400 genérico; JSON comprimido que viola el esquema de login: 422.
- JSON exactamente de 8 MiB llega al guard anónimo (401); por encima del límite se rechaza con el 500 genérico existente, tanto normal como gzip: dos casos.
- Compresión inválida: error genérico controlado y una solicitud posterior responde 200.
- Regresión del aviso: fixture mínimo con `express.json()` de la misma instalación. Envía un frame deflate válido y un byte cero; espera confirmación de finalización del parser antes de enviar los 1024 bytes restantes. La respuesta espera el fin de la solicitud completa: exige desenganchar/drenar correctamente el stream. Finaliza con 200 y JSON exacto, sin excepción no capturada; la aplicación real responde después. La coordinación no depende de una demora arbitraria ni de enviar todo el payload en un único bloque.

Resultado focalizado: diez aprobadas, cero fallidas/omitidas. El fixture del decoder es una prueba sintética de la dependencia, no una reproducción de caída en producción; no se ejecutó un ataque contra servicios existentes ni una corrida negativa con 2.3.0.

Validación estándar: typecheck, lint, build y `git diff --check` aprobados; `npm run test:unit`: 52 archivos aprobados, 15 omitidos; 684 pruebas aprobadas, 255 omitidas, cero fallidas. Las omitidas no se consideran aprobadas. Build conserva advertencias conocidas de anotaciones Zod/Rollup. Sin cambios frontend, no se realizó inspección visual.

El sandbox impidió DNS del registro npm y renombrado de caché de Vitest. Las consultas/actualización npm y pruebas se completaron con ejecución autorizada fuera del sandbox, conservando el runner test:unit y su setup de seguridad. No se deshabilitaron guardas ni se alteró el Paso 3C. La ejecución real de GitHub Actions sigue pendiente y no se reaudita aquí.

## Límites y revisión

Corrección local lista para revisión del propietario; sin autorización de commit/publicación. El objetivo se limita a este aviso y no equivale a una auditoría integral de dependencias, certificación de ausencia de otros DoS ni validación de SiteGround. Las cuatro bases conservadas y producción no se conectaron ni modificaron. B2/B3/B4, migraciones y configuración permanecen fuera de esta intervención.
