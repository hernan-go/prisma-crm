# Iteración 10.1 — Propuestas de edición del Know-How (CRM)

## Cierre productivo — 02/11/2026

Estado definitivo: Iteración 10.1 completada. Evidencia de producción y de Work/Sites aportada por el propietario para este cierre; no revalidada mediante nuevas operaciones productivas. CRM ae3cea9eb81115f0edb5a665016fa1661e9e6b19 publicado, 012 y 013 registradas; contador, Antes/Después y decisiones administrativas operativos. Regresión CRM previa: 662 aprobadas y lint/typecheck/build satisfactorios.

Worker GitHub c80fc8b61392bb3425cec187c0341e83ef80710b. Site PRISMA — Análisis de Gestión, project_id appgprj_6ade63d3e6948191b5ed522945af814e, privado exclusivo del propietario. Versión 5: appgprj_6ade63d3e6948191b5ed522945af814e~appgver_9cce8b086e948191be6e05ab1866070a; commit interno e57be72e758ad2ea2e8f0d1fa16aae2651b8d937. Deploy inicial appgdep_6ae7c9cab59c8191953846c32fe6cfd7; redespliegue para secreto appgdep_6ae7d7cd14f08191a1d66f723c17d9d8. Recuperación conservada: versión 4, appgprj_6ade63d3e6948191b5ed522945af814e~appgver_0709265231ec819199a713a65b150a6e. No confundir SHA GitHub con SHA interno Sites.

Work/Sites informó instalación oficial pnpm@11.25.0 con lockfile respetado, 40/40 pruebas, typecheck, lint, build y artefacto aprobados y fuentes sincronizadas. El bloqueo Windows es antecedente ambiental, no pendiente productivo. Cuatro herramientas registradas: consultar_estadisticas_comerciales, consultar_conocimiento_empresarial, enviar_propuesta_conocimiento y consultar_estado_propuesta_conocimiento. Credenciales independientes configuradas en runtime de ambos servicios; no se incluyen valores.

QA real autorizada: documento sintético 46005380-7721-4585-8abe-bcda622f70e1, propuesta f252cf1f-7e4d-4fb3-9af7-8c560ce61338, pending → aprobación administrativa → approved, revisión 3, content_version 2 y lectura posterior concordante. Documento desactivado, no eliminado; ausente de activos y lectura por ID DOCUMENTO_NO_DISPONIBLE. Recibo aprobado disponible. Seis documentos empresariales reales sin cambios en esta prueba.

prisma_dev: 013 manual tras respaldo C:/dev/personal/PRISMA-backups-local/prisma_dev_pre_013_20261101_221842.sql, exportación exitosa y verificaciones básicas; restauración no ensayada. Propietario confirmó recepción, indicador/comparador, aprobación e incremento de versión, rechazo con texto ausente y recibo conservado, cero pendientes tras resolver. prisma_demo tuvo errores de consulta y no fue migrado/revalidado: pendiente ambiental independiente.

Límites: consentimiento declarado por cliente, administración compartida, dependencia del proxy HTTPS; sin auditoría exhaustiva de seguridad/concurrencia ni recuperación ante desastres. El historial se almacena pero no tiene explorador administrativo de versiones. Asistente comercial completo, Estadísticas, Google Login e informes/PDF continúan fuera de esta entrega.

## Antecedentes de implementación local

Los estados pendientes siguientes describen su fecha original y quedan superados exclusivamente por el cierre anterior.

Implementación local del alcance autorizado el 01/11/2026. Rama `codex/iteration-10-1-knowledge-proposals`, base `f5945e1`. Sin commits, publicación ni cambios al Worker. El handoff del propietario confirma Know-How y MCP de lectura funcionando en producción; no se releyeron pilares ni se verificó producción durante esta implementación.

## Modelo y permisos

`013.sql` agrega `knowledge_edit_proposals`, sin modificar documentos, períodos ni migraciones 001–012. Numeración cotejada con el árbol y `schema_migrations` de `prisma_test` local (001–012 antes de implementar). No se consultaron bases dev/demo/productivas.

Se reciben exclusivamente propuestas sobre documentos activos y no eliminados. Cada propuesta contiene Markdown completo inmutable, revisión y versión base, SHA-256, request_id único y fecha del servidor. El contenido base se obtiene de la instantánea histórica existente, no de la versión vigente al revisar.

Credencial exclusiva `AI_PROPOSAL_TOKEN_SHA256`: hash SHA-256 de un Bearer hexadecimal de 64 caracteres. No se generaron ni configuraron credenciales reales. Ausencia/configuración inválida o coincidencia con `AI_READ_TOKEN_SHA256` deshabilita el servicio (503). Se reutilizan exclusivamente los parámetros de transporte `AI_READ_PUBLIC_ORIGIN`, `AI_READ_TRUSTED_PROXY_IPS`, `AI_READ_TRANSPORT_MODE` y, solo fuera de producción, `AI_READ_ALLOW_LOCAL_HTTP`. El router y sus permisos son independientes del lector; nunca admite aprobar/rechazar ni alcanza rutas administrativas.

Modo `siteground_managed` conserva la suposición existente: SiteGround aísla Node y reemplaza cabeceras de forwarding. Confirmar esa condición antes de activar recepción; no se verificó en producción. No confiar en cabeceras de identidad del modelo.

La administración compartida actual aprueba/rechaza, sin inventar identidad personal. Es obligatorio Origin igual a APP_URL, sesión válida y hash de la propuesta revisada. POST sin Origin se rechaza. No se incorporan OAuth, usuarios ni roles.

## Contrato preparado para el futuro Worker

Namespace de servicio: `/api/integrations/knowledge-proposals`.

- `POST /`: JSON estricto `{request_id: UUID, document_id: UUID, expected_revision: entero positivo, content_md: string, content_sha256: hex SHA-256}`. Hash sobre bytes UTF-8 exactos, sin normalizar saltos de línea. Devuelve HTTP 200 con recibo tanto para alta como repetición.
- `GET /:proposal_id`: sin cuerpo ni query; devuelve recibo. No entrega contenido documental ni propuesto.
- Recibo: `proposal_id`, `request_id`, `document_id`, `base_revision`, `base_content_version`, `content_sha256`, `status`, `source: "chatgpt"`, `created_at`, `decided_at`, `decided_by`, `result_revision`, `result_content_version`. Fechas DB UTC presentadas en ART por la UI, siguiendo la convención existente. `decided_by` es `administration` o null.
- Estados: `pending`, `outdated`, `approved`, `rejected`. `outdated` se deriva al consultar si cambió revisión/disponibilidad; sigue contando como pendiente de resolución. No se fusiona ni caduca automáticamente.
- Misma request_id y payload: mismo recibo durable, incluso después de aprobar/rechazar. Misma clave con documento/revisión/contenido distintos: 409. Ante pérdida de respuesta reenviar exactamente la misma solicitud; no generar otro request_id. La rotación futura de credencial no elimina esta idempotencia de instalación.
- Errores: 400 JSON inválido; 401 credencial; 403 transporte/navegador; 404 ausente/inactivo; 405 método; 409 conflicto; 413 tamaño JSON; 415 formato/compresión no soportados; 422 contrato, Unicode, hash o Markdown inválidos; 429 frecuencia/bandeja llena; 503 deshabilitado/ocupado/fallo interno sin detalles privados.

Markdown máximo 512 KiB UTF-8, validación existente más rechazo de sustitutos Unicode aislados. JSON de recepción hasta 4 MiB para contemplar escapes; sin descompresión. Límites por proceso: 60 ingresos/minuto, 20 solicitudes autenticadas/minuto y dos solicitudes simultáneas. Tope durable global de 100 propuestas pendientes, bajo bloqueo. Los recibos resueltos se conservan para evitar duplicados; no tienen política de eliminación automática.

La futura herramienta MCP de envío deberá declararse escritura (`readOnlyHint:false`) aunque no publique, y conservar idempotencia. La consulta de recibo será lectura. No habrá herramientas de aprobación/rechazo. Worker y Site quedan para una etapa separada.

## API administrativa y guardado

Bajo sesión: `GET /api/knowledge/proposals/counts`, `GET /api/knowledge/proposals?document_id=UUID`, `GET /api/knowledge/proposals/:id` (solo pendientes, con `title`, `before_md`, `content_md`), y `POST /api/knowledge/proposals/:id/approve|reject` con `{content_sha256}` estricto.

Recepción y resolución toman el mismo bloqueo exclusivo de biblioteca. Aprobación reutiliza `knowledgeSaveLocked`, núcleo extraído de `knowledgeSave`, dentro de una única transacción con el recibo. Mantiene título/categoría/ID/estado; actualiza Markdown y versión conforme a semántica actual. Guardado idéntico no consume versión. Una aprobación invalida propuestas basadas en revisiones anteriores; 409 preserva la propuesta y el documento vigente. Repetir la misma decisión devuelve el recibo; intentar la decisión opuesta devuelve 409.

Rechazo pone content_md en NULL y no crea instantánea: conserva identificadores, hashes y decisión técnica sin texto. Aprobación también retira la copia de propuesta; el contenido aprobado queda en el versionado normal. No hay papelera, restauración ni historial visual de rechazadas. Esta eliminación es lógica en tablas de aplicación: no promete borrado físico de copias de seguridad o logs binarios de MySQL preexistentes; las políticas del operador siguen siendo externas a esta entrega.

## UI y revisión

Píldora amarilla con contador real; selector individual si hay varias propuestas. Acceso desde tarjeta y editor (requiere no tener borrador modificado). Modal con metadata de dos filas/tres columnas en escritorio, fuente única, fecha ART, Antes/Después y contexto. Markdown mostrado como texto React escapado, sin HTML ejecutable, imágenes ni enlaces activos. Algoritmo acotado de coincidencias de líneas; conserva prefijo/sufijo común al resaltar reemplazos. No pretende producir siempre el diff mínimo. Secciones ATX solo cuando se identifica una única sección sin ambigüedad; si no, se omite etiqueta. Comparaciones extensas paginadas en grupos de 200 filas, sin truncar el contenido guardado.

Cerrar, X y Escape no envían decisiones. Foco inicial conservador y retorno al control anterior. Móvil apila paneles con scroll interno; errores no sobrescriben documentos. Tras resolución se invalidan contadores/listas y se retira la comparación resuelta de la caché.

## Validación y publicación posterior

Pruebas focalizadas de contrato/transporte/UI y MySQL sintético en `tests/knowledge-proposals*.test.ts`. Suite DB habilitada únicamente por `RUN_KNOWLEDGE_PROPOSALS_DB_TESTS=true`, `DB_NAME=prisma_test`; verifica host y SELECT DATABASE() antes de migrar o escribir, y elimina sus documentos al finalizar. Ejecutar secuencialmente respecto de las suites generales y de Know-How que reinician esquema. La fixture `tests/browser/knowledge-proposals.html` usa solo memoria, intercepta red y no conecta DB.

Para QA futura: ejecutar primero migración en destino local autorizado, iniciar CRM con DB_NAME explícito y revisar documentos sintéticos. La suite de propuestas no requiere credenciales reales de servicio. Para publicación: revisión/aprobación del propietario, respaldo productivo y preflight 001–012; aplicación manual de 013 y postflight; luego deploy del CRM compatible. No activar servicio hasta configurar por canal seguro la credencial independiente y validar transporte. Worker se implementa/publica después, en el mismo Site privado, con autorización separada. Un push MCP no equivale a deploy. Recuperación: deshabilitar recepción, conservar tabla/recibos/versiones y volver a código verificado; no borrar tablas como rollback automático.

## Cierre local — 01/11/2026

Evidencia previa conservada: 14 pruebas focalizadas sin DB y 11 de integración aprobadas exclusivamente en prisma_test; 013 aplicada allí. QA sintética en navegador a 390/768/1440 px: cierres Cerrar/X/Escape sin operaciones, comparación, aprobación individual y bloqueo de la segunda propuesta desactualizada. El rechazo y borrado de contenido están comprobados por integración; el último clic de rechazo en la fixture quedó sin observación final antes de la interrupción, por lo que no se declara validación visual de ese resultado.

Cierre incremental solicitado por el propietario: cuatro casos de contrato/diff aprobados (incluido el nuevo caso de prefijos/sufijos, fragmentación y Unicode) y un caso HTTP de revisión aprobado en prisma_test. Compilación completa con typecheck, lint de archivos de esta iteración y git diff --check aprobados. Advertencias conocidas no bloqueantes de anotaciones Zod/Rollup. No se repitieron suites completas ni se reabrió navegador. Servidor Vite sintético detenido. Implementación local terminada, pendiente de revisión del propietario y publicación controlada; regresión completa del CRM no ejecutada en esta entrega. Sin commits/push/deploy, sin credenciales reales nuevas y sin cambios en dev/demo/producción o Worker MCP.
