# PRISMA CRM

Administración interna de personas, inscripciones mensuales, talleres, pagos e inversión publicitaria. Aplicación React y API Express con MySQL. No usa PHP, microservicios ni Docker en producción.

## Estado y alcance

Implementa personas con archivo lógico y contacto de emergencia; períodos vacíos; actividades con días configurables; múltiples horarios; agenda filtrada; cuentas manuales, pagos divididos, deuda y saldo a favor; dashboard; publicidad; importador XLSX/CSV con mapeo, revisión, duplicados y transacciones.

No incluye login propio, acceso de docentes, Inglés, pago a talleristas, inversiones generales ni copia automática de inscripciones. **La protección externa debe cubrir todo el sitio y `/api`.** No publicar datos personales hasta verificarlo. La API de producción permanece bloqueada mientras `EXTERNAL_PROTECTION_CONFIRMED` no sea `true`.

## Estructura y decisiones

```text
client/              React, Router, Query, formularios, diseño responsive oscuro
server/app.ts        Seguridad y errores centralizados; punto de futura autenticación
server/routes.ts     Rutas/controladores REST y validación de peticiones
server/services.ts   Operaciones transaccionales de negocio
server/repositories.ts Consultas reutilizables y persistencia de personas
server/db.ts         Pool mysql2 y transacciones
server/migrations/   Esquema versionado SQL
server/importer.ts   Lectura y preparación XLSX/CSV
shared/domain.ts     Zod, horarios, teléfonos y cálculos decimales
scripts/             Vista previa de migración y preparación local opcional
tests/               Unitarias, HTTP e integración MySQL
docs/                Análisis de fuentes, modelo y verificación
.github/workflows/   Validación automática con MySQL aislado
```

- React, TypeScript estricto, Vite, React Router, TanStack Query, React Hook Form, Zod, Tailwind CSS y Lucide React.
- Express 5, TypeScript y mysql2 con consultas parametrizadas. Se eligió mysql2 directo para evitar una capa adicional; las consultas no interpolan datos del usuario.
- Dinero: `DECIMAL(12,2)`, strings decimales en API y Decimal.js para operaciones en JavaScript. No se usa FLOAT. Los totales del dashboard se agregan por cuenta para evitar multiplicación por joins de horarios.
- Una inscripción por persona/período/actividad con N slots. Para agregar otro día de una actividad existente, editar sus horarios.
- Los docentes son configuración. La asignación de docente de una actividad es actual: cambiarla también cambia el nombre mostrado en vistas históricas. Si se requiere conservar asignaciones históricas exactas, crear una actividad nueva en lugar de reasignar la existente.
- Días no permitidos bloqueados en cliente y servidor. Reglas modificadas no borran inscripciones anteriores; se validan al crear o editar.
- Fechas operativas `DATE` y cadenas `YYYY-MM-DD`; horarios semanales `HH:mm`, sin conversiones UTC. Creación de movimientos usa fecha actual en America/Argentina/Cordoba.
- IDs `P-0001` asignados a partir de la clave autoincremental. Los IDs del Excel no reemplazan los IDs nuevos.
- Saldos sin importe definido permanecen `null`. Pendiente suma deudas positivas; saldo a favor se informa separado y no oculta la deuda de otra persona.
- Teléfono original conservado. Índices en nombre, teléfono normalizado, DNI y email. Búsqueda parcial con debounce y páginas de 40 registros; una búsqueda `%texto%` puede escanear filas, apropiado para esta escala, no se promete búsqueda indexada de millones de registros.
- Escrituras de personas e importaciones comparten un bloqueo MySQL para prevenir carreras en la detección de duplicados. Importación atómica: una falla revierte el lote completo.

## Requisitos

Node.js 22.12+ o 24 LTS, npm, MySQL 8.0.16+ (probado con 8.4.8), base UTF-8 y usuario con acceso a esa base. Git para versionar. No requiere Docker. CI usa un contenedor MySQL únicamente como servicio de pruebas.

## Instalación local

```sh
npm ci
```

Copiar `.env.example` a `.env`. Crear base y usuario en la instalación MySQL local o en su administrador:

```sql
CREATE DATABASE prisma CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'prisma'@'localhost' IDENTIFIED BY '<contraseña elegida localmente>';
GRANT ALL PRIVILEGES ON prisma.* TO 'prisma'@'localhost';
```

Los nombres/permisos en SiteGround deben crearse desde su panel. No ejecutar estas sentencias con nombres ajenos a la base del CRM.

```sh
npm run db:migrate
npm run db:seed
npm run dev
```

Abrir `http://localhost:5173`. Vite redirige `/api` al puerto 3001. Para desarrollo usar `APP_URL=http://localhost:5173`. Para revisar el build con `npm start`, usar `APP_URL=http://localhost:3001`.

Las migraciones aplicadas quedan en `schema_migrations`. El runner usa un bloqueo exclusivo. MySQL realiza commit implícito de DDL: no asumir rollback completo de una migración de esquema. La inicial es reejecutable con `IF NOT EXISTS`; respaldar antes de futuras migraciones y no editar migraciones ya aplicadas. La seed solo crea configuración faltante y no reinicia los días modificados por administración. Nunca carga personas reales.

En este equipo se preparó una instancia **local de desarrollo** MySQL 8.4.8 en `tmp/mysql/`, con puerto 3307 y bases `prisma_dev`/`prisma_test`. No es un servicio de Windows y no se despliega. `.env` contiene la credencial local generada; `private/local-mysql-admin.json` es solo para administrar esa instancia. Ambos están excluidos de Git. Para volver a iniciarla desde PowerShell:

```powershell
$base = Join-Path (Get-Location) 'tmp/mysql/mysql-8.4.8-winx64'
$data = Join-Path (Get-Location) 'tmp/mysql-data'
& "$base/bin/mysqld.exe" --no-defaults "--basedir=$base" "--datadir=$data" --port=3307 --bind-address=127.0.0.1 --mysqlx=OFF --console
```

`scripts/setup-local-db.ts` es una utilidad de arranque único para esa instancia recién inicializada, no un instalador ni un paso de producción. La demo local contiene únicamente personas de prueba claramente identificadas.

## Variables de entorno

| Variable                        | Uso                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| NODE_ENV                        | `development` local, `production` en hosting                                                           |
| PORT                            | Puerto entregado por el proveedor; fallback 3001                                                       |
| APP_URL                         | Origen exacto, sin barra final; HTTPS en producción                                                    |
| DB_HOST / DB_PORT               | Servidor y puerto MySQL provistos por SiteGround                                                       |
| DB_NAME / DB_USER / DB_PASSWORD | Credenciales exclusivamente del servidor                                                               |
| DB_SSL                          | `true` si MySQL exige TLS con certificado verificable; no desactivar verificación para sortear errores |
| TRUST_PROXY                     | Número de proxies confiables; por defecto 0, confirmar topología con el proveedor antes de cambiar     |
| EXTERNAL_PROTECTION_CONFIRMED   | `true` solo tras probar Protected URLs en página y API                                                 |

No prefijar secretos con `VITE_`, no copiarlos al frontend ni subir `.env` a Git. Variables de build no deben contener datos personales. Las credenciales del servicio MySQL de CI son ficticias, efímeras y sin acceso a producción.

## Build y validación

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
```

`npm test` ejecuta las pruebas sin DB y omite explícitamente integración si no se habilita. Para ejecutar todas contra una base descartable `prisma_test`, configurar las credenciales de esa base y:

```powershell
$env:RUN_DB_TESTS='true'
$env:DB_NAME='prisma_test'
npm test
```

En Linux/macOS: `RUN_DB_TESTS=true DB_NAME=prisma_test npm test`. **La suite borra las tablas de prisma_test. Nunca apuntarla a datos reales.** El nombre se valida antes de borrar. Ver [docs/QA.md](docs/QA.md) para evidencias y checklist de producción.

## Importación y migración del Excel existente

```sh
npm run import:preview -- "C:/ruta/PRISMA GESTIÓN .xlsx"
```

Lee `Personas`, encabezados fila 3. Produce `private/import-preview.json` con filas, validaciones, coincidencias dentro del archivo y conteos. No escribe en MySQL ni modifica el Excel. Es un archivo sensible: mantenerlo local, excluido de Git y eliminarlo cuando no sea necesario mediante el administrador de archivos.

Resultado del archivo suministrado: 32 filas con datos personales, 31 válidas por campos obligatorios, 1 incompleta, 0 duplicados fuertes entre filas y 968 filas sin datos personales descartadas. **Las 32 requieren revisar nombre/apellido.** Validez sintáctica no garantiza una separación correcta.

Proceso definitivo:

1. Personas → Importar. Seleccionar XLSX o CSV (máximo 5 MB, 10.000 filas y 100 columnas por hoja).
2. Para el Excel actual, indicar fila 3, leer y elegir Personas si no es la primera hoja. Volver a leer tras cambiar hoja/fila.
3. Corregir la correspondencia de columnas y pulsar aplicar.
4. Revisar cada registro. El último término del nombre combinado se propone como apellido, siempre requiere revisión. Corregir nombres compuestos y el registro sin teléfono.
5. Coincidencias por teléfono normalizado, DNI o email se omiten inicialmente. Elegir omitir, actualizar coincidencia o crear igualmente de forma explícita.
6. Revisar las filas marcadas como duplicadas entre sí. Se vuelven a comprobar contra DB al confirmar, inclusive si otros registros se crearon mientras se revisaba.
7. Actualizar reemplaza los campos personales básicos de la fila, incluidos vacíos. Conserva contacto de emergencia, estado, inscripciones y pagos existentes.
8. Confirmar revisión de cada fila elegida y confirmar el lote. Si surge un conflicto, el lote completo se revierte; no hay importación parcial silenciosa.

No se migran pagos históricos desde las casillas TRANS/EFECTIVO: no permiten reconstruir fechas ni importes por medio con suficiente certeza. Tampoco se infieren inscripciones desde fórmulas/vistas del libro. Cargar esos movimientos solo después de una conciliación humana. Los importes publicitarios originales con coma/punto y notas sobre crédito requieren revisión antes de cargarlos; el CRM conserva únicamente fecha, concepto, importe y notas, sin inventar contabilidad de créditos.

## Despliegue en SiteGround GrowBig

Verificado el 25/09/2026 con documentación oficial: GrowBig admite proyectos Node.js, despliegue desde GitHub, gestión MySQL y Protected URLs. Fuentes: [disponibilidad](https://www.siteground.com/es/kb/node-js), [crear proyecto](https://www.siteground.com/es/kb/crear-proyecto-node-js), [gestionar proyecto y seguridad](https://es.siteground.com/kb/gestionar-proyecto-node-js).

Los nombres exactos y el mecanismo de arranque pueden variar con el preset del panel. La documentación consultada confirma opciones de build, versión Node, rama, salida y variables, pero no un campo universal de start command. Esta app necesita **un proceso Node persistente** que ejecute `npm start`; no desplegar `dist/client` como sitio estático aislado.

1. Crear un repositorio **privado** en GitHub. Revisar `git status` y confirmar que no se incluyen `private`, `tmp`, `.env`, Excel, PDF o dumps.
2. Agregar el remote privado y hacer push de la rama de despliegue. La rama local puede ser `codex/prisma-crm`; al integrar usar `main` o la rama elegida explícitamente en el panel.
3. Abrir SiteGround Client Area → Websites → Node.js Projects → New Project.
4. Elegir Import Git Repository, vincular GitHub y autorizar **solo** el repositorio privado del CRM.
5. Seleccionar repositorio y rama. La integración de SiteGround recompila automáticamente los pushes a esa rama; la CI de GitHub prueba el código por separado. Para impedir despliegues de cambios sin validar, proteger la rama y exigir checks antes de merge.
6. En Site Tools → Node.js → Deployment Options, escoger el preset adecuado para Node/Express, Node 24 (o 22.12+), npm y raíz del repositorio.
7. Build del proyecto: `npm ci --include=dev && npm run build`. Si SiteGround ya instala dependencias, asegurarse de que incluya las de desarrollo durante build y usar `npm run build` como comando de build.
8. Arranque requerido: `npm start` (equivale a `node dist/server/index.js`). Buscar el mecanismo de startup del preset o confirmarlo con soporte si la UI no lo expone. El servidor escucha `0.0.0.0` y respeta `PORT`.
9. Artefactos necesarios: `dist/server`, `dist/shared`, `dist/client`, `server/migrations`, `package.json`, lockfile y dependencias runtime. Si el panel exige Output directory, confirmar cómo ese preset empaqueta el proceso Node: no asumir que solo `dist/client` basta. La app debe arrancar con cwd en la raíz del proyecto.
10. Crear MySQL en Site Tools → Website → MySQL, crear usuario, asignarlo a la base y tomar host/puerto indicados por el panel. Dar permisos de esquema para migrar; el runtime solo necesita SELECT/INSERT/UPDATE/DELETE. Puede usarse un usuario separado para migraciones.
11. Configurar variables en Site Tools. Usar inicialmente el origen HTTPS del dominio temporal en APP_URL, `NODE_ENV=production` y `EXTERNAL_PROTECTION_CONFIRMED=false`.
12. Ejecutar `npm run db:migrate` y `npm run db:seed` desde la consola/SSH si está habilitada. Como alternativa con artefactos compilados: `node dist/server/migrate.js` y `node dist/server/seed.js`. Si no hay consola en ese plan/interfaz, pedir al soporte el mecanismo de comando puntual. No habilitar un endpoint público para migrar ni ejecutar migraciones automáticamente en cada start.
13. Activar Security → Protected URLs sobre la raíz completa del dominio temporal. Crear accesos externos para Jesica y Hernán. Usar HTTPS y verificar en una sesión sin credenciales que `/`, `/personas` y `/api/people` exigen protección. Verificar también que no exista otro dominio/URL directo del proyecto que evite la protección.
14. Solo después de esa comprobación establecer `EXTERNAL_PROTECTION_CONFIRMED=true` y reiniciar/redeploy según la UI. Abrir el sitio protegido y verificar `/api/health`, actividades y períodos.
15. Antes de datos reales, realizar el smoke test con una persona ficticia en una base de staging. La base productiva empieza sin personas ni períodos.
16. En el dominio temporal protegido, realizar la primera importación revisada desde Personas → Importar. Guardar backup antes y después.
17. Asignar `crm.prisma.com.ar` desde las acciones del proyecto, según el flujo de cambio de dominio. Configurar DNS conforme a los valores provistos por SiteGround, sin adivinarlos.
18. Instalar/verificar SSL y Forzar HTTPS en Security. Cambiar APP_URL a `https://crm.prisma.com.ar`.
19. Confirmar nuevamente Protected URLs en el dominio definitivo y cualquier alias/temporal; comprobar tanto frontend como API sin credenciales.
20. Ejecutar el smoke test de producción, revisar logs y hacer backup inicial. Confirmar que un push de prueba a la rama seleccionada dispare el autodespliegue y que los datos MySQL sobrevivan.

**Pendiente externo:** crear/vincular el repositorio privado, configurar cuenta SiteGround, dominio, credenciales MySQL y protección; ejecutar smoke final sobre ese hosting. No se creó ni publicó un recurso externo desde esta sesión.

## Backups y restauración

Usar los backups del hosting y verificar su disponibilidad/retención en la cuenta contratada. Antes de importar o migrar, exportar MySQL desde phpMyAdmin de SiteGround o con `mysqldump` (el proyecto no usa PHP; phpMyAdmin es solo una herramienta del hosting).

```sh
mysqldump --single-transaction --routines --triggers --no-tablespaces -h HOST -u USER -p DB_NAME > prisma-backup.sql
```

`-p` solicita la contraseña sin ponerla en el comando. Guardar exportaciones cifradas en almacenamiento restringido, fuera de Git y fuera del directorio público. Probar restauración en **otra base vacía** con `mysql -h HOST -u USER -p DB_DESTINO < prisma-backup.sql` y comprobar recuentos y saldos antes de reemplazar datos productivos. Pausar escrituras antes de una restauración. Acordar con administración frecuencia y retención; punto de partida diario y antes de cambios, sujeto al volumen real.

## Troubleshooting

- **503 protección:** verificar Protected URLs y la variable de confirmación; no usarla para reemplazar la protección externa.
- **500 / error DB:** revisar host, permisos, base creada y migraciones. Logs muestran códigos de error, sin datos personales, consultas ni secretos.
- **403 al guardar:** APP_URL debe coincidir exactamente con el origen de navegador, incluido puerto local. Reiniciar después de cambiar variables.
- **Sitio en blanco / assets 404:** construir primero, ejecutar desde raíz y conservar `dist/client`. No servir una carpeta de build distinta.
- **Duplicado al inscribir:** la persona ya tiene esa actividad ese mes; abrir Editar horarios para agregar slots.
- **Reglas de día:** editar Configuración; no cambiar componentes. Verificar que tanto actividad como docente estén activos.
- **Importación rechazada:** revisar fila de encabezados, campos obligatorios, teléfono con al menos seis dígitos, tamaño y duplicados. No se aceptan ZIP64 ni libros con más de 40 MB descomprimidos; exportar solo la hoja de personas si el libro es grande.
- **Windows / esbuild / tsx con Access denied:** ejecutar el comando autorizado en una terminal normal fuera del sandbox de la herramienta, no cambiar permisos del sistema de forma global.
- **Cerrar entorno local:** detener Node con Ctrl+C. Apagar la instancia MySQL propia con `mysqladmin` usando las credenciales locales guardadas. No detener otras instalaciones.
