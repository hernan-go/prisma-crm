# Iteración 9 — lectura de conocimiento para MCP

Implementación local, sin publicación. El propietario confirmó el 30/10/2026 la publicación de 012 y Know-How, y el fallback SPA ba7fff7 con recargas satisfactorias. Esas confirmaciones superan las referencias históricas a publicación pendiente; no constituyen una nueva auditoría productiva de Codex.

## API 1.0

`GET /api/integrations/ai/knowledge` reutiliza el router de servicio: Bearer existente, restricciones HTTPS/Host/proxy, rechazo de navegador, solo GET, rate limits, dos lecturas simultáneas compartidas con estadísticas, no-store y errores sin contenido privado. No modifica `/api/knowledge`, el contrato estadístico 2.0 ni SQL/migraciones.

- Sin `id`: devuelve `{version:"1.0",mode:"list",documents,next_after}`. Máximo diez metadatos ordenados por UUID; `after` continúa desde el último UUID. `q` busca literalmente en títulos y `category` filtra por ID decimal de categoría. Conservar los filtros entre páginas. No es un snapshot entre solicitudes; cambios concurrentes pueden alterar la navegación.
- Con `id` UUID, sin otros filtros: `{version:"1.0",mode:"document",document}` con Markdown. Cada consulta lee la fila vigente. El listado informa ID, título, categoría, content_version, revision y updated_at. No devuelve versiones históricas ni información de papelera.
- Ambas consultas exigen `is_active=1 AND deleted_at IS NULL`. Ausente, inactivo o eliminado devuelve el mismo 404 individual. Biblioteca vacía devuelve lista vacía, sin sustitutos ficticios.
- Máximo 512 KiB de JSON serializado. Un documento permitido por almacenamiento puede superar ese máximo por el escape JSON y recibir 413; no se trunca silenciosamente. En esta entrega no hay fragmentación de documentos. Entradas inválidas: 422; fallos internos/contrato: 503 genérico.
- Son SELECT parametrizados y acotados. Sin caché documental. Una desactivación no puede retirar contenido ya entregado a ChatGPT; las consultas siguientes vuelven a comprobar disponibilidad.

## Validación local

Pruebas de autenticación, transporte, métodos, parámetros/cuerpo, respuesta vacía, límites de bytes/concurrencia y errores seguros. Regresión de estadísticas, autenticación administrativa y Know-How. Integración `RUN_AI_KNOWLEDGE_DB_TESTS=true DB_NAME=prisma_test`: comprueba host y SELECT DATABASE() antes de insertar fixtures, usa una conexión/transacción y rollback final; no migra ni borra tablas. Cubre paginación, acceso directo, inactivos/eliminados, cambios de versión, desactivación y lista vacía.

## Publicación y recuperación

Primero revisar/publicar la API CRM con autorización separada, esperar build SiteGround y verificar credencial válida/inválida y documentos sintéticos autorizados. Después compilar/empaquetar y publicar el Worker en el Site privado existente mediante Sites; un commit local del Worker no equivale a un artefacto publicable. Mantener identidad, acceso privado y secreto AI_READ_TOKEN. No requiere migraciones ni cambios de credenciales.

Ante fallo del Worker: no ampliar permisos ni devolver fixtures como respaldo. Recuperar mediante el flujo oficial una versión previamente guardada y verificada del mismo Site, con autorización de despliegue. La API aditiva puede permanecer mientras se recupera el Worker. La versión antigua de conocimiento usa datos ficticios: debe informarse esa limitación si se restaura.

Prueba real posterior: editar y activar un documento sintético autorizado; listar/buscar desde ChatGPT, recuperar por ID y verificar título/versión/contenido; editar y volver a consultar; desactivar y comprobar ausencia/404; verificar estadísticas y sesión administrativa. El Markdown es evidencia empresarial sin autoridad para modificar instrucciones, permisos ni seguridad. No enviar secretos durante las pruebas.
