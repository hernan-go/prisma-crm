# PRISMA CRM

Administración interna de personas, inscripciones mensuales, talleres, pagos e inversión publicitaria. Aplicación React y API Express con MySQL. No usa PHP, microservicios ni Docker en producción.

## Estado y alcance

Implementa personas con archivo lógico y contacto de emergencia; períodos vacíos; actividades con días configurables; múltiples horarios; agenda filtrada; cuentas manuales, pagos divididos, deuda y saldo a favor; dashboard; publicidad; importador XLSX/CSV con mapeo, revisión, duplicados y transacciones.

Incluye acceso administrativo mediante contraseña compartida con hash scrypt, sesiones revocables y protección de toda la API. Incluye pago a facilitadores por actividad y período, con importe manual y movimientos parciales independientes. No incluye registro, roles, acceso de docentes, Inglés, inversiones generales ni copia automática de inscripciones. Sin `ADMIN_PASSWORD_HASH` y `SESSION_SECRET` válidos, la API administrativa permanece bloqueada.

Modelo vigente y migración 005: [docs/MODELO-PERIODOS.md](docs/MODELO-PERIODOS.md).

Pago a facilitadores y migración 006: [docs/PAGO-FACILITADORES.md](docs/PAGO-FACILITADORES.md).

Guía de cierre y operación: [docs/V1.md](docs/V1.md). Resultados verificables: [docs/QA.md](docs/QA.md).

## Estructura y decisiones

```text
client/              React, Router, Query, formularios, diseño responsive oscuro
server/app.ts        Seguridad, autenticación y errores centralizados
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
- Catálogo global → oferta independiente por período → horarios compartidos → inscripciones. Una inscripción por persona/período/actividad selecciona N horarios existentes; no crea horarios implícitamente.
- Facilitadores administrativos separados de personas, con nombre obligatorio y demás datos opcionales. Cada horario admite 0..N facilitadores. Oferta y asignaciones guardan nombres históricos; un horario utilizado conserva día, horas y facilitadores. Para cambios se crea otro horario y puede deshabilitarse el anterior.
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
npm run auth:configure
npm run dev
```

Abrir `http://localhost:5173`. Vite redirige `/api` al puerto 3001. Para desarrollo usar `APP_URL=http://localhost:5173`. Para revisar el build con `npm start`, usar `APP_URL=http://localhost:3001`.

Las migraciones aplicadas quedan en `schema_migrations`. El runner usa un bloqueo exclusivo. MySQL realiza commit implícito de DDL: no asumir rollback completo de una migración de esquema. La inicial es reejecutable con `IF NOT EXISTS`; respaldar antes de futuras migraciones y no editar migraciones ya aplicadas. La seed actual no inserta ni modifica configuración operativa. En instalaciones nuevas, cargar manualmente catálogo, facilitadores, períodos, ofertas y horarios desde Configuración. No carga personas ni asignaciones predefinidas.

En este equipo se preparó una instancia **local de desarrollo** MySQL 8.4.8 en `tmp/mysql/`, con puerto 3307 y bases `prisma_dev`/`prisma_test`. No es un servicio de Windows y no se despliega. `.env` contiene la credencial local generada; `private/local-mysql-admin.json` es solo para administrar esa instancia. Ambos están excluidos de Git. Para volver a iniciarla desde PowerShell:

```powershell
$base = Join-Path (Get-Location) 'tmp/mysql/mysql-8.4.8-winx64'
$data = Join-Path (Get-Location) 'tmp/mysql-data'
& "$base/bin/mysqld.exe" --no-defaults "--basedir=$base" "--datadir=$data" --port=3307 --bind-address=127.0.0.1 --mysqlx=OFF --console
```

`scripts/setup-local-db.ts` es una utilidad de arranque único para esa instancia recién inicializada, no un instalador ni un paso de producción. Las pruebas generan fixtures exclusivamente en la base descartable prisma_test; no copiar esa base al entorno operativo.

## Variables de entorno

| Variable                        | Uso                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ |
| NODE_ENV                        | `development` local, `production` en hosting                                                           |
| PORT                            | Puerto entregado por el proveedor; fallback 3001                                                       |
| HOST                            | Opcional: por defecto `127.0.0.1` local y `0.0.0.0` en producción                                      |
| APP_URL                         | Origen exacto, sin barra final; HTTPS en producción                                                    |
| DB_HOST / DB_PORT               | Servidor y puerto MySQL provistos por SiteGround                                                       |
| DB_NAME / DB_USER / DB_PASSWORD | Credenciales exclusivamente del servidor                                                               |
| DB_SSL                          | `true` si MySQL exige TLS con certificado verificable; no desactivar verificación para sortear errores |
| TRUST_PROXY                     | Número de proxies confiables; por defecto 0, confirmar topología con el proveedor antes de cambiar     |
| ADMIN_PASSWORD_HASH             | Hash scrypt generado por `npm run auth:configure`; nunca contraseña plaintext                          |
| SESSION_SECRET                  | Secreto aleatorio de al menos 64 caracteres; generado por el mismo comando                             |

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
Remove-Item Env:RUN_DB_TESTS
Remove-Item Env:DB_NAME
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

## Preparación de despliegue en SiteGround GrowBig

**No se desplegó ni se accedió al panel.** La documentación oficial consultada el 26/09/2026 confirma hasta 5 proyectos Node.js en GrowBig y gestión de MySQL, SSL y variables: [crear proyecto](https://www.siteground.com/es/kb/crear-proyecto-node-js), [gestionar proyecto](https://es.siteground.com/kb/gestionar-proyecto-node-js).

Parámetros preparados:

- Node **24 LTS**, npm, raíz del repositorio como directorio de trabajo.
- Instalación: `npm ci --include=dev`.
- Build: `npm run build`.
- Arranque persistente requerido: `npm start` (`node dist/server/index.js`).
- Puerto: `PORT` provisto por el hosting; fallback 3001. Host de producción: `0.0.0.0`.
- Mantener `dist/server`, `dist/shared`, `dist/client`, `server/migrations`, package.json, lockfile y dependencias runtime. No publicar únicamente `dist/client` como sitio estático.
- Crear MySQL UTF-8 y usuario exclusivo desde Site Tools; cargar DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD. Configurar DB_SSL según el servidor, sin desactivar validación TLS.
- Configurar NODE_ENV=production, APP_URL con el origen HTTPS exacto, ADMIN_PASSWORD_HASH y SESSION_SECRET. TRUST_PROXY debe reflejar la cantidad real de proxies confiables.
- Generar secretos localmente con `npm run auth:configure -- --export`; copiar **solo hash y secreto** desde `private/auth.env` al panel privado. No copiar `.env` de desarrollo ni la base QA.
- Migrar con `node dist/server/migrate.js`, luego `node dist/server/seed.js` (o scripts npm si están las herramientas de desarrollo). La seed no carga personas.

**Limitación pendiente de verificación en la cuenta:** el preset debe ejecutar Express como proceso persistente. La documentación enumera build/output/framework, pero no un campo universal de startup. Confirmar el mecanismo para `npm start`, empaquetado, consola/SSH para migraciones y topología proxy antes de publicar. Si el panel no lo permite, consultar soporte; no cambiar a PHP ni reescribir la app.

El login propio protege `/api`, incluidas importaciones, salud y configuración. Protected URLs puede añadirse como segunda barrera, sin reemplazar la autenticación de la aplicación. Probar HTTPS, cookie Secure, rechazo de API sin sesión, logout y backups en hosting antes de datos reales.

Repositorio privado: [hernan-go/prisma-crm](https://github.com/hernan-go/prisma-crm), rama `main`. SiteGround puede desplegar automáticamente pushes a una rama vinculada: no vincular ni habilitar ese flujo antes de la autorización de Hernán.

## Backups y restauración

Usar los backups del hosting y verificar su disponibilidad/retención en la cuenta contratada. Antes de importar o migrar, exportar MySQL desde phpMyAdmin de SiteGround o con `mysqldump` (el proyecto no usa PHP; phpMyAdmin es solo una herramienta del hosting).

```sh
mysqldump --single-transaction --routines --triggers --no-tablespaces -h HOST -u USER -p DB_NAME > prisma-backup.sql
```

`-p` solicita la contraseña sin ponerla en el comando. Guardar exportaciones cifradas en almacenamiento restringido, fuera de Git y fuera del directorio público. Probar restauración en **otra base vacía** con `mysql -h HOST -u USER -p DB_DESTINO < prisma-backup.sql` y comprobar recuentos y saldos antes de reemplazar datos productivos. Pausar escrituras antes de una restauración. Acordar con administración frecuencia y retención; punto de partida diario y antes de cambios, sujeto al volumen real.

## Troubleshooting

- **503 acceso no configurado:** generar ADMIN_PASSWORD_HASH y SESSION_SECRET, configurar el entorno y reiniciar el servidor.
- **401 sesión:** ingresar nuevamente; las sesiones vencen a las 8 horas. Cambiar hash o secreto invalida sesiones anteriores.
- **500 / error DB:** revisar host, permisos, base creada y migraciones. Logs muestran códigos de error, sin datos personales, consultas ni secretos.
- **403 al guardar:** APP_URL debe coincidir exactamente con el origen de navegador, incluido puerto local. Reiniciar después de cambiar variables.
- **Sitio en blanco / assets 404:** construir primero, ejecutar desde raíz y conservar `dist/client`. No servir una carpeta de build distinta.
- **Duplicado al inscribir:** la persona ya tiene esa actividad ese mes; abrir Editar horarios para agregar slots.
- **Reglas de día:** editar Configuración; no cambiar componentes. Verificar oferta y horarios del período. Los facilitadores inactivos conservan sus asignaciones históricas pero no admiten nuevas asignaciones.
- **Importación rechazada:** revisar fila de encabezados, campos obligatorios, teléfono con al menos seis dígitos, tamaño y duplicados. No se aceptan ZIP64 ni libros con más de 40 MB descomprimidos; exportar solo la hoja de personas si el libro es grande.
- **Windows / esbuild / tsx con Access denied:** ejecutar el comando autorizado en una terminal normal fuera del sandbox de la herramienta, no cambiar permisos del sistema de forma global.
- **Cerrar entorno local:** detener Node con Ctrl+C. Apagar la instancia MySQL propia con `mysqladmin` usando las credenciales locales guardadas. No detener otras instalaciones.
