# Cierre del modelo mensual — 27/09/2026

Continuación sobre los cambios existentes, sin reiniciar arquitectura. HEAD permanece en b3b3d60e9f7d06b69ce4b69c3d58ff89af1cff2a. Sin commit, push, GitHub ni acceso a producción.

| Comprobación final                             | Resultado                                             |
| ---------------------------------------------- | ----------------------------------------------------- |
| npm run lint                                   | Exit 0; sin errores ni advertencias                   |
| npm run typecheck                              | Exit 0; sin errores                                   |
| RUN_DB_TESTS=true DB_NAME=prisma_test npm test | 6 archivos; 92 tests aprobados, 0 fallidos, 0 skipped |
| npm run build                                  | Exit 0; frontend Vite y backend TypeScript compilados |

Última suite completa: 17:11:18 hora local, duración 4,44 s. MySQL real 8.4.8 en puerto 3307. 18 casos adicionales sobre los 74 anteriores. Pruebas ejecutadas fuera del sandbox por restricción de lectura de esbuild en Windows. Build conserva dos avisos no bloqueantes de anotaciones de comentarios en Zod; no se alteraron dependencias. Auditoría de dependencias no repetida en esta ronda; los resultados V1 de más abajo son históricos.

Verificaciones nuevas: ofertas independientes entre meses; horarios compartidos; cero, dos y tres facilitadores; campos opcionales; capacidad individual; conflictos con cualquiera de varios facilitadores; historial tras renombrar/archivar; eliminación segura; deshabilitar y reactivar ofertas; conservar horarios deshabilitados ya inscritos; filtros Agenda; nombres históricos en Dashboard; Forms con resolución única, ausencia y ambigüedad; rollback del lote con pagos. Migración 004→005 preserva filas de personas, períodos, inscripciones, cuentas, pagos, sesiones y demás tablas no afectadas. Caso sintético financiero: 50.000 a cobrar, dos pagos de 25.000, saldo cero.

La suite ampliada inicialmente alcanzó el rate limit de una instancia. Se separaron los ciclos de aplicación de los escenarios; autenticación y límites reales siguen habilitados y no se modificaron.

Navegador sobre build local y prisma_test: login, cambio de período, Configuración mensual, modal de facilitador con todos sus campos, horario con selección múltiple opcional, días restringidos, opciones 09:00–20:00/30 minutos y error fin ≤ inicio. Agenda muestra un bloque con tres facilitadores y dos asistentes; filtro por tercer facilitador + lunes + 10:00 devuelve ese bloque. Filtros usan nombres históricos del período. Gestión mensual muestra correctamente actividad grupal e individual con sus facilitadores. No se guardaron altas adicionales en navegador ni se importaron archivos reales. Los flujos de importación/CRUD y rollback se verificaron en tests HTTP/MySQL.

Evidencia visual local ignorada por Git: tmp/qa-agenda-modelo.png. La migración se probó únicamente en prisma_test; la base operativa y producción no se migraron. Modelo y procedimiento de aplicación en [MODELO-PERIODOS.md](MODELO-PERIODOS.md).

---

# Verificación de cierre V1 — 27/09/2026

Se preservaron los checkpoints 418005a y d632d1c. El checkpoint 4866f08 resguarda autenticación y trabajo posterior; no se reemplazó la arquitectura ni se descartaron cambios.

## Resultados técnicos

| Comprobación                                     | Resultado                                            |
| ------------------------------------------------ | ---------------------------------------------------- |
| `npm run lint`                                   | Correcto                                             |
| `npm run typecheck`                              | Correcto                                             |
| `RUN_DB_TESTS=true DB_NAME=prisma_test npm test` | 6 archivos, 74 tests: 74 passed, 0 failed, 0 skipped |
| `npm run build`                                  | Correcto: frontend Vite y backend TypeScript         |
| `npm audit`                                      | 0 vulnerabilidades                                   |

MySQL real 8.4.8 en 127.0.0.1:3307; base descartable prisma_test. Las pruebas de integración estuvieron habilitadas, no omitidas. Incluyen migraciones/seeds repetibles, duplicados normalizados, pagos/carteras/saldos, conflictos de persona/docente/capacidad, grupo compartido, períodos cerrados, importación atómica/reintentos y limpieza QA con huellas. Autenticación cubre acceso correcto/incorrecto, expiración, token inválido, logout revocable, rate limiting y atributos de cookie.

Dos advertencias de Rollup por comentarios @**PURE** dentro de Zod son no bloqueantes. No se cambiaron dependencias para silenciar comentarios de terceros.

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
