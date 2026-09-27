# Verificación de cierre V1 — 27/09/2026

Se preservaron los checkpoints 418005a y d632d1c. El checkpoint 4866f08 resguarda autenticación y trabajo posterior; no se reemplazó la arquitectura ni se descartaron cambios.

## Resultados técnicos

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` | Correcto |
| `npm run typecheck` | Correcto |
| `RUN_DB_TESTS=true DB_NAME=prisma_test npm test` | 6 archivos, 74 tests: 74 passed, 0 failed, 0 skipped |
| `npm run build` | Correcto: frontend Vite y backend TypeScript |
| `npm audit` | 0 vulnerabilidades |

MySQL real 8.4.8 en 127.0.0.1:3307; base descartable prisma_test. Las pruebas de integración estuvieron habilitadas, no omitidas. Incluyen migraciones/seeds repetibles, duplicados normalizados, pagos/carteras/saldos, conflictos de persona/docente/capacidad, grupo compartido, períodos cerrados, importación atómica/reintentos y limpieza QA con huellas. Autenticación cubre acceso correcto/incorrecto, expiración, token inválido, logout revocable, rate limiting y atributos de cookie.

Dos advertencias de Rollup por comentarios @__PURE__ dentro de Zod son no bloqueantes. No se cambiaron dependencias para silenciar comentarios de terceros.

## Correcciones del cierre

- Normalización de DNI en búsqueda, aviso y detección definitiva de duplicados.
- Mapping explícito de Programa acompañamiento cognitivo y pruebas de todas las opciones conocidas solicitadas.
- Contador del importador genérico según filtro actual.
- Controles de Pagos bloqueados correctamente en período cerrado, incluida edición.
- Generación/exportación de credenciales sin imprimir secretos; solo archivo privado ignorado.
- Ampliación de nombres ficticios reconocidos por limpieza segura y documentación operativa actualizada.

## Evidencia de navegador

Instancia nueva del build en localhost:3002, con prisma_test y credencial aleatoria efímera; no se configuró contraseña definitiva.

Verificado en esta ronda: rechazo de password incorrecta y login válido; personas (listado, búsqueda por nombre/teléfono/DNI sin puntos, alta, edición, archivo y reactivación), aviso anticipado por teléfono duplicado; alta de dos actividades consecutivas y rechazo de superposición personal; pago por transferencia, cartera Hernán, cuenta 20.000 / pagado 25.000 / saldo a favor 5.000; creación de período y selección posterior, duplicado inmediato, corrección del error, cierre y reapertura; Informática individual con lunes a sábado en Configuración.

CSV exclusivamente ficticio: autodetección, revisión individual, pago inicialmente excluido, aprobación obligatoria, opción desconocida bloqueada y omitida explícitamente. Consulta MySQL antes de confirmar: cero personas del CSV creadas. Resultado final: 1 persona, 2 inscripciones, 1 pago y 1 respuesta omitida. Nueva lectura del archivo detectó duplicado y lo dejó omitido. Rollback e idempotencia verificados en tests de API/MySQL; no se atribuye esa comprobación al navegador.

Las rondas previas verificaron pagos mixtos, edición/eliminación, contacto de emergencia, agenda filtrada, publicidad y XLSX/CSV genérico. No se repitieron todos esos recorridos sin cambios funcionales. El viewport mobile del importador, configuración y pagos se comprobó a aproximadamente 360 píxeles CSS; el control de navegación horizontal existente se conserva. La revisión final de branding registra sus tamaños adicionales en V1.md.

## Datos y migraciones

001–004 aplicadas y probadas contra prisma_test. prisma_dev no fue migrada/resetada durante este cierre; ejecutar sus migraciones antes del arranque habitual.

Inspección sin borrado de prisma_dev: 8 candidatos QA, distribuidos en 5 personas (IDs 1–5), actividad 9, docente 9 y publicidad 1, además de sus relaciones. No se ejecutó limpieza. prisma_test contiene fixtures desechables y se reinicia únicamente por la suite explícita. No se cargaron personas ni archivos reales.

El procedimiento `npm run qa:cleanup` solo genera un plan privado; aplicar exige backup, base explícita y reviewed=true por registro. Valida huellas y relaciones, aborta si cambiaron, conserva configuración ajena y períodos. Ver V1.md.

## Límites y pasos de puesta en marcha

No quedan bugs bloqueantes conocidos. La V1 usa acceso administrativo compartido, una instancia de servidor y asignación docente actual, no histórica. Mobile con navegación avanzada y auditoría por usuario quedan POST-V1.

Pendiente operativo: elegir contraseña definitiva, configurar entorno, migrar la base local habitual y revisar/limpiar QA antes de datos reales. Migración del Excel maestro importa personas revisadas; sus pagos e inscripciones históricas requieren conciliación humana y no se infieren automáticamente.

No se desplegó en SiteGround ni se abrió su panel. Confirmar mecanismo de arranque Express, proxy, HTTPS, MySQL y restauración de backups en la cuenta antes del deployment manual. La preparación está en README; la verificación final del hosting sigue pendiente por alcance.
