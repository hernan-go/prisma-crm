# Iteración 9 — Know-How IA: biblioteca operativa (entrega 1)

Estado vigente: entrega integrada en `0a164246ae3072d14fb7ab8dc56c21a585daf496`, rama `integration/iteration-9-knowledge-facilitators`, respaldada en GitHub y aprobada manualmente por el propietario en desarrollo. Pendiente de producción. La implementación inicial sobre `d57d0df` se conserva en `249ba3f`, los ajustes UX/UI en `e222e09` y la corrección de Facilitadores en `d9483ba`. No modifica D020–D024 ni el MCP. Los apartados de validaciones anteriores son antecedentes; sus pendientes de commit, integración y revisión local quedan superados por el cierre siguiente.

## Cierre local integrado y QA del propietario — 29/10/2026

Merge confirmado con dos padres (`e222e09` y `d9483ba`). Único conflicto en `tests/model-fixtures.ts`: se conservaron las tablas documentales y recurrentes en orden de claves foráneas, sin pérdida de cambios. `docs/ARCHITECTURE.md`, `docs/DECISIONS.md` y `tests/integration.test.ts` combinados y revisados; funcionalidades y pruebas de ambas ramas conservadas. Migración 012 y cinco mejoras UX/UI sin alteraciones por integración.

Validación integrada: typecheck, lint, build y diff check aprobados; 448 pruebas normales aprobadas/172 omitidas; 606 generales MySQL aprobadas/14 omitidas; 9 documentales MySQL y 23 focalizadas aprobadas. Suites ejecutadas secuencialmente, integración solo en `prisma_test`, con host/nombre comprobados. Advertencias de anotaciones Zod/Rollup no bloqueantes. No se repitieron pruebas ni operaciones DB en este cierre exclusivamente documental.

### Migración de desarrollo y respaldo

`012.sql` aplicada y registrada mediante runner acotado en `prisma_dev`, MySQL local `127.0.0.1:3306` 8.4.11. Migraciones exactamente 001–012; 29 tablas, con cuatro documentales nuevas. Columnas, tipos, defaults, charset/collation, ocho índices, cuatro PK, dos UNIQUE, diez CHECK ENFORCED y dos FK RESTRICT verificados contra el SQL. Las cuatro tablas estaban vacías al terminar el postflight, antes de la QA manual posterior. Las 25 tablas originales conservaron esquemas y huellas de todos sus registros, incluidas columnas invisibles, salvo el nuevo registro de migración. Sin objetos inesperados.

El comparador inicial se detuvo por representación textual de `chk_knowledge_document_size`: MySQL almacenó LENGTH en lugar de OCTET_LENGTH. Ambas funciones miden bytes y son sinónimas; se contrastaron las expresiones, documentación MySQL y un ejemplo multibyte mediante SELECT. Verificación completada en lectura, sin reparar ni reejecutar DDL.

Respaldo externo previo: `C:/Users/Hernán/prisma-crm-backups/2026-10-29T19-20-19-pre-012-prisma_dev-6d1334b5f7484256ac08fcc13235aa99/prisma_dev-reintento.sql`, 38.582 bytes, SHA-256 `7AB32B531E552534DBF6F44807FF8612B487E898E229B350DEBFE1930FCBD2D2`. Lectura completa UTF-8, encabezado/cierre, 25 definiciones coincidentes, conteos por tabla y 001–011 verificados; permisos restringidos al propietario y SYSTEM. No se cotejó cada valor del dump con origen ni se restauró: restaurabilidad no demostrada. SHA-256 de 012: `523E330D041AE0D92EA2FA5114CB372B759645CC61387636CE0C27874C33D53E`.

### Aprobación manual comunicada por el propietario

Pruebas realizadas en `prisma_dev`, con datos ficticios, no en producción:

- Facilitadora Lucía QA renombrada a Lucila QA: nombre actualizado en Configuración, horarios y Pago Facilitadores, conservando honorarios y pago ficticio.
- Cinco pilares inicializados; edición con versión 2; activación/desactivación sin generar versión de contenido.
- Exportación Markdown correcta; importación y sugerencia de título correctas; sexto documento creado inactivo en versión 1.
- Advertencia de cambios sin guardar y conflicto HTTP 409 entre pestañas correctos; consulta de versión vigente y descarga de borrador con contenido conservado.

Estos recorridos constituyen aprobación manual del propietario; no se presentan como una nueva auditoría independiente de Codex ni como evidencia productiva.

### Siguiente paso: preflight productivo pendiente

La entrega no está publicada en producción. `012.sql` sigue pendiente allí. Know-How todavía no se conecta al asesor IA; el MCP privado operativo y la autenticación permanecen intactos. Iteración 9 continúa abierta con todos sus demás pendientes.

Antes de producción: verificar destino real y registro 001–011, ausencia de estructuras parciales knowledge, permisos, versión y sesiones/escritores; obtener y verificar respaldo productivo y definir recuperación ante DDL parcial. La restaurabilidad del respaldo local no fue demostrada y no sustituye un respaldo productivo. Aplicación productiva manual/guiada por el propietario, con autorización separada, seguida de postflight antes del despliegue compatible y smoke. El push a main dispara deploy y no debe adelantarse a la preparación de DB. Detenerse ante discrepancias; no asumir rollback de DDL ni restaurar automáticamente. No trasladar datos ficticios ni el respaldo de desarrollo a producción. Inicialización de pilares productivos será explícita y separada.

## Alcance implementado

Ruta `/know-how`, menú Know-How IA, título Centro de Conocimiento Empresarial. Biblioteca privada global por instalación, sin FK ni filtros de períodos. Listado paginado (30), búsqueda por título, filtros, categorías editables/ordenables/archivables, creación/importación Markdown revisable, edición, activación, exportación individual y vista previa segura. No comparte datos entre instalaciones.

Inicialización explícita de cinco documentos pilares mediante plantillas orientativas genéricas: Identidad y Modelo de Negocio; Servicios, Operaciones y Calidad; Marketing, Comercialización y Experiencia del Participante; Finanzas, Precios y Sostenibilidad; Estrategia, Dirección y Gestión de Riesgos. Inactivos inicialmente, sin categorías obligatorias ni hechos empresariales inventados. Marca persistente, transacción única, claves estables y reintentos sin sobrescritura ni recreación de pilares ausentes.

## Persistencia y concurrencia

`012.sql` crea cuatro tablas InnoDB/utf8mb4: `knowledge_categories`, `knowledge_documents`, `knowledge_document_versions`, `knowledge_library_state`. Sin documentos, categorías ni períodos durante la migración. La fila de estado se crea al escribir por primera vez. `001–011` inmutables.

`revision` cambia con contenido/metadatos o activación. `content_version` y las instantáneas cambian solo con título, categoría o Markdown. Activación no consume versiones de contenido y su historia no se presenta como auditoría individual. Todas las revisiones se conservan en esta entrega; no existe depuración. Instantáneas incluyen nombre histórico de categoría y hash de contenido. Cambiar el nombre global de una categoría no reescribe instantáneas anteriores. Procedencia administrativa compartida, sin atribución a personas.

Escrituras breves serializadas mediante bloqueo exclusivo de la fila singleton de la biblioteca, independiente del bloqueo de personas. Control optimista mediante `expected_revision`; conflicto 409 conserva editor y permite consultar el vigente/descargar borrador. UUID del alta generado una vez en el cliente para reintentos idempotentes; documentos distintos pueden compartir título. Nombre de categoría único según collation de MySQL. Posiciones iguales se ordenan por nombre/ID.

## Seguridad y límites

Router `/api/knowledge` detrás de la sesión administrativa existente, sin autorización mediante Bearer MCP. Zod estricto y SQL parametrizado. Markdown UTF-8 hasta 512 KiB, tanto importado como editado. Archivos en memoria, sin rutas derivadas de nombres. `react-markdown@10.1.0` con elementos permitidos, HTML deshabilitado, imágenes excluidas y enlaces HTTP(S) sin referrer/opener. Contenido privado no cacheable, sin logs de contenido ni localStorage. Guardado explícito y avisos al cerrar, recargar o navegar fuera con cambios pendientes.

API de esta entrega: GET state; POST initialize; GET/POST categories; PUT categories/:id; GET/POST documents; GET/PUT documents/:id; PATCH documents/:id/status; POST import (valida, no persiste); GET documents/:id/export. Todo bajo `/api/knowledge`. No hay endpoints de historial, restauración, eliminación, respaldo masivo ni consulta IA.

## Migración y recuperación de DDL parcial

La migración se aplicó en `prisma_test` y posteriormente, bajo autorización separada, en `prisma_dev` según el cierre anterior; continúa pendiente en producción. El runner detecta tablas knowledge preexistentes sin registro 012 y aborta antes de ejecutar sus sentencias. CREATE sin IF NOT EXISTS falla también ante objetos existentes: no se presume compatibilidad ni rollback de DDL.

Un fallo parcial requiere inspección manual de tablas, restricciones y datos antes de decidir recuperación; no borrar tablas ni marcar la migración como aplicada automáticamente. El esquema es aditivo y compatible con el código anterior. Antes de cualquier activación futura en otra base, corresponde autorización, respaldo, preflight, aplicación controlada y postflight. La activación separada en prisma_dev ya está completada; este cierre no autoriza migraciones en demo o producción.

## Validación

- 15 pruebas focalizadas sin DB: validación, importación, límites multibyte, XSS, enlaces, autenticación y Bearer rechazado.
- 9 pruebas focalizadas MySQL: migración/registro y rechazo de estado parcial, inicialización concurrente/idempotente, altas repetidas, conflictos, instantáneas, rollback, categorías, períodos y exportación HTTP.
- Suite general: 442 aprobadas, 171 omitidas sin habilitar integración. Con RUN_DB_TESTS sobre prisma_test: 599 aprobadas, 14 omitidas. Las 9 pruebas knowledge se habilitan separadamente para evitar carreras con el reinicio global de esquema.
- Se corrigieron los dos puntos de limpieza de fixtures existentes para respetar las FK de 010–011, detectadas al ejecutar la suite completa. No cambió lógica productiva de Gastos.
- Revisión visual sintética en navegador a 390 y 1440 px: listado, editor/vista previa y aviso de descarte; conflicto 409 simulado conserva el texto. No equivale a aprobación manual del propietario ni prueba con lector de pantalla.

## Revisión manual local

### Continuación y revisión técnica — 29/10/2026

Se preservaron los 12 archivos modificados y 11 nuevos existentes sobre `d57d0df`, sin cambio de rama ni integración de `origin/fix/facilitator-display-names`. Revisión de migración 012, router autenticado, bloqueo de biblioteca, versiones de contenido separadas de activación, frontend y orden de limpieza de fixtures: sin defectos nuevos comprobados que requieran cambios de código.

Validaciones repetidas en secuencia: typecheck y lint aprobados; suite normal con `--no-file-parallelism`, 442 aprobadas/171 omitidas; integración general con la misma opción, 599 aprobadas/14 omitidas; suite documental DB ejecutada separadamente, 9 aprobadas. Destino local verificado mediante `SELECT DATABASE()` = `prisma_test` antes de integración. La suite documental retiró sus fixtures al finalizar. Build completo aprobado con advertencias conocidas de anotaciones Zod/Rollup. El intento inicial de Vitest dentro del sandbox falló por EPERM sobre su caché temporal; el reintento fuera del sandbox aprobó. Revisión visual de esta continuación no repetida: se conserva la evidencia sintética previa, sin sustituir la aprobación del propietario.

Sin cambios en código durante esta continuación. Solo se agregó este registro de validación. Pendiente revisión del propietario antes de autorizar commit y respaldo remoto; no se ejecutaron commit, push, merge ni operaciones productivas.

Solo con la base de pruebas ya preparada. Usar una terminal nueva y no iniciar otro backend si el puerto 3001 está ocupado:

```powershell
$env:DB_NAME='prisma_test'
npm run dev
```

Abrir `http://localhost:5173/know-how` (o el puerto localhost informado por Vite), ingresar con la autenticación administrativa local existente. Crear pilares, repetir la acción, editar, crear categoría, importar UTF-8, activar/desactivar, exportar y abrir el mismo documento en dos pestañas para comprobar 409. No ingresar contenido empresarial real en prisma_test. Detener con Ctrl+C y quitar la variable con `Remove-Item Env:DB_NAME`.

Vista únicamente sintética, sin backend ni credenciales: `npx vite --host 127.0.0.1 --port 5182 --strictPort` y `/tests/browser/knowledge.html`. Sus escrituras están deshabilitadas y responden 409 para verificar el conflicto del editor.

Prueba focalizada DB, separada de la suite global:

```powershell
$env:DB_NAME='prisma_test'
$env:RUN_KNOWLEDGE_DB_TESTS='true'
npx vitest run tests/knowledge-db.test.ts
Remove-Item Env:RUN_KNOWLEDGE_DB_TESTS
Remove-Item Env:DB_NAME
```

Esta suite verifica base/host y reinicia únicamente las tablas documentales de prisma_test. Retira sus documentos sintéticos al finalizar y deja el esquema preparado.

## Ajustes UX/UI posteriores a revisión manual — 29/10/2026

El propietario confirmó revisión funcional satisfactoria de Entrega 1 y publicación del commit `249ba3f` en su rama. Se prepararon ajustes locales sin nuevo commit: pastillas Activo/Inactivo con LED decorativo y texto; exportación con slug de título (hasta 100 caracteres) y UUID para distinguir títulos iguales; propuesta editable de título desde H1 fuera de bloques de código o nombre legible del archivo. El Markdown no se transforma ni se guarda automáticamente.

Descarte centrado mediante opción `centeredDiscard` de Modal, utilizada solo por editor/categorías de Know-How. El modo predeterminado de otros formularios permanece igual. Aviso 409 centrado con consulta vigente, descarga del borrador y retorno al editor; se puede reabrir y conserva comparación, revisión esperada y bloqueo de guardado. Diálogo nativo en portal con fondo atenuado, foco inicial en acción conservadora, Escape y retorno del foco.

QA de navegador con fixture sintético, sin backend/DB: 390, 768 y 1440 px; descarte/seguir editando/Escape, foco, título importado editable sin alterar Markdown, conflicto reabrible y consulta vigente sin reemplazar borrador. Descarga de borrador comparada byte a byte con contenido local UTF-8. Capturas en `tmp/knowledge-ux/` (excluidas de Git). Fixture permite importación sintética y exportación, pero rechaza persistencia con 409. Pruebas focalizadas: 21 aprobadas, incluidas seis nuevas sobre nombres, títulos, estados accesibles, editor y modo predeterminado de Modal. Sin cambios de backend, migración, autenticación, versiones o MCP; sin dependencias nuevas ni pruebas DB.

Validación final de ajustes UX/UI: typecheck, lint, build y diff check aprobados; suite normal secuencial, 448 aprobadas y 171 omitidas. Build con advertencias conocidas Zod/Rollup. Cambios locales pendientes de revisión, sin commit ni push.

## Pendientes fuera de alcance

Interfaz de historial, versiones protegidas/restauración/depuración, papelera, eliminación definitiva, backup integral/recuperación, consulta MCP, instrucciones del asesor y Google Login. Los campos futuros quedan sin funcionalidad; retención no configurada, sin plazo automático. Las versiones locales no sustituyen un respaldo. Activación y QA de desarrollo completadas; falta preflight productivo, migración 012 productiva manual autorizada, publicación y smoke bajo alcances separados.
