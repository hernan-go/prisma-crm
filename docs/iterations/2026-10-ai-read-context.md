# Iteración 9 — P0: acceso empresarial completo de lectura

## Estado vigente

Corrección LOCAL autorizada expresamente por el propietario el 25/10/2026, registrada en D024. Principio: **máxima disponibilidad de información empresarial, mínima exposición de datos personales**. Esta decisión sustituye definitivamente la supresión de agregados pequeños de la primera implementación: no hay umbral de cinco, supresión complementaria ni ocultamiento de bloques económicos por pocos registros. No reintroducir esa política desde documentación o pruebas antiguas.

Arquitectura: sistema → API segura de lectura → complemento MCP privado → ChatGPT. Sin API paga de modelos; contrato independiente del proveedor. IA asesora; administradores deciden. Centro de conocimiento privado dentro del sistema, con Markdown y acceso/versiones, reservado a una etapa posterior. El Site y los Markdown privados no fueron consultados ni modificados. No se implementan planes comerciales, modelos contables ni escrituras operativas.

Rama local codex/iteration-9-ai-read-context, HEAD 501f5bb preservado. Sin nuevos commits, push, merge, despliegue, migraciones, configuración productiva ni datos modificados. La Iteración 9 continúa abierta.

## Contrato vigente 2.0

GET /api/integrations/ai/monthly-context?period=2026-10

Solo un parámetro period=AAAA-MM, años 2020–2100, sin cuerpo ni filtros individuales. Período existente abierto o cerrado; un 404 nunca crea datos. Cambió la versión mayor porque desaparecieron estados de supresión y se agregaron desgloses: el futuro consumidor debe validar 2.0 y no asumir compatibilidad con el ejemplo 1.0 inicial.

Incluye as_of UTC (inicio de lectura consistente, no última modificación), eje económico, ARS, unidades, fuentes, cobertura y advertencias. Dinero string decimal exacto; NULL, ausencia y cero diferenciados. Subtotal conocido cuando cobertura es parcial/indefinida.

| Bloque            | Contenido                                                                                                                                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| people            | Membresías, personas únicas con inscripción y sin actividad. Sin filtro por estado actual de la persona.                                                                                                                                                                                |
| contracting       | Inscripciones y plazas semanales por actividad, incluso frecuencias de uno; máximos/mínimos con empates. Yoga mañana+tarde más Movimiento: 1 persona, 2 inscripciones, 3 plazas. No asistencia.                                                                                         |
| offered_schedules | Inventario habilitado por catálogo/oferta/horario, sin participantes ni contactos. No es capacidad. Conteos incluyen inscripciones conservadas sobre horarios deshabilitados.                                                                                                           |
| combinations      | Conjuntos exactos de actividades por persona, agregados con personas/inscripciones/plazas, incluyendo frecuencia uno. IDs de personas permanecen dentro de SQL. Se valida longitud de GROUP_CONCAT para no exportar claves truncadas.                                                   |
| continuity        | Mes calendario inmediatamente anterior existente: inscriptos antes/ahora, conservados, nuevos en el par y sin inscripción actual. No infiere bajas, abandono ni primera incorporación real. Sin mes previo: unavailable, no cero ni salto a otro mes.                                   |
| collections       | Obligaciones, cobros, pendientes, créditos, aplicado, cobros con obligación indefinida, porcentaje y cobertura. Disponibles incluso con una sola cuenta.                                                                                                                                |
| fees              | Totales y acuerdos por oferta/profesional: ID operativo de acuerdo/oferta/profesional, actividad, nombre profesional actual, importe pactado nullable, pagado, pendiente nullable, exceso y cantidad de pagos. No notas, documentos, contactos o historia inventada de renegociaciones. |
| expenses          | Total y todas las categorías con movimientos: denominación empresarial, catálogo recurrente nullable, concepto controlado, tipo, importe y cantidad. Un único alquiler también se exporta. No acredita que esté pagado.                                                                 |

Conceptos controlados: catálogo recurrente o categoría empresarial del período. period_expenses.concept es descripción libre sin clasificación segura; se excluye junto con notas. No se inventa catálogo de conceptos adicionales. Todos sus importes siguen incluidos por categoría. Las denominaciones deben mantenerse empresariales, sin datos personales incrustados; ser etiqueta no garantiza ausencia de datos privados.

No se exportan identidades/IDs reales de participantes, DNI, contactos privados, domicilios, emergencias, salud, notas personales, credenciales o hashes. Las identidades operativas de profesionales y referencias de configuración/acuerdos no son identificadores de participantes. No se necesitan seudónimos en este contrato: combinaciones y continuidad son agregados; una futura consulta individual requeriría diseño específico.

unavailable declara tarifas/promociones/paquetes históricos estructurados, costos incrementales, capacidad grupal, atribución de ingresos, asistencia, historial completo de bajas/correcciones, conceptos adicionales controlados y condiciones futuras de honorarios ausentes. No calcula utilidad neta ni rentabilidad por actividad. Comparaciones mensuales mediante consultas del mismo contrato para períodos existentes, sin reconstruir registros eliminados.

## Privacidad y confianza

Acceso empresarial amplio exclusivamente con autenticación y autorización de servicio. Datos empresariales siguen siendo privados. Grupos infrecuentes y honorarios nominados permiten posibles inferencias mediante conocimiento externo o diferencias temporales: riesgo residual explícito de D024, no garantía de anonimato ni motivo para inutilizar la economía.

La protección aplica lista blanca y alcance de datos, sin umbrales de población. No hay exportación indiscriminada de tablas ni textos personales. El contenido empresarial es información para analizar, no instrucciones que puedan ampliar permisos.

## Lectura y cálculos

Una conexión y transacción REPEATABLE READ / WITH CONSISTENT SNAPSHOT, READ ONLY; commit/rollback y liberación. Solo SELECT parametrizados. readSummaryInput conserva el lector compartido y añade metadatos operativos de acuerdos; readSummary y calculateSummary mantienen fórmulas. El mismo motor calcula métricas globales y por acuerdo; función existente para pendiente nullable de facilitadores.

Pagos por período de cuenta/oferta, no por fecha efectiva. Slots preagrupados antes de unir a inscripciones. Conciliación de combinaciones y gastos; sin multiplicar finanzas por joins. Límites de recursos, no supresión estadística: 500 actividades, 2.000 horarios, 500 categorías, 2.000 acuerdos/combinaciones, respuesta 512 KiB y dos consultas simultáneas. Exceso devuelve error, no contexto parcial.

## Contexto externo futuro

Inflación e indicadores oficiales argentinos, jubilaciones/pensiones y novedades de ANSES, poder adquisitivo, mercado/actividades similares de Rosario, feriados/calendario local, festividades, fechas especiales, estacionalidad, eventos y costos verificables. ChatGPT puede aportar fuentes actualizadas con fuente, referencia y fecha de consulta. Sin valores coyunturales como constantes permanentes ni nueva integración externa en esta etapa.

## Seguridad y configuración

Namespace terminal independiente, antes de CORS, parser JSON y guard administrativo. Token no habilita otras rutas; cookie administrativa no habilita esta. Solo GET: HEAD/OPTIONS y escrituras devuelven 405 tras autenticación. Sin cookies nuevas, todas las respuestas `Cache-Control: no-store`. Errores sin SQL ni excepciones subyacentes y sin registro de tokens/datos desde el módulo.

Variables de servidor fuera de Git:

| Variable                    | Configuración                                                                                                                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_READ_TOKEN_SHA256`      | SHA-256 del TEXTO de un token criptográfico aleatorio de 32 bytes, representado por 64 caracteres hexadecimales minúsculos. No hashear sus bytes decodificados. El token original queda solo en el consumidor. |
| `AI_READ_PUBLIC_ORIGIN`     | Origen HTTPS exacto sin ruta ni barra final.                                                                                                                                                                   |
| `AI_READ_TRUSTED_PROXY_IPS` | IPs exactas de peers del proxy que conecta a Node, separadas por comas; sin comodines/CIDR. Vacío exige TLS directo.                                                                                           |
| `AI_READ_ALLOW_LOCAL_HTTP`  | `true` admite HTTP solo desde loopback y fuera de producción. Predeterminado false; ignorado en producción.                                                                                                    |

Cabecera: `Authorization: Bearer <token>`. Comparación SHA-256 con `timingSafeEqual`. No reutilizar contraseña administrativa o SESSION_SECRET, ni guardar secretos en URL, frontend, Markdown, capturas o logs. Generar/transmitir el token fuera del chat mediante un canal seguro. Un hash formalmente válido no acredita entropía: depende de generación criptográfica correcta. Rotación/revocación: reemplazar par hash/token y reiniciar; quitar hash deshabilita con 503. No hay credencial por defecto.

HTTPS requiere TLS real del socket o `X-Forwarded-Proto: https` exacto desde peer expresamente autorizado, con Host coincidente con el origen configurado. No depende de `req.secure` ni del `TRUST_PROXY` administrativo. Antes de despliegue, verificar que SiteGround preserva Host y SOBRESCRIBE el protocolo reenviado y que el listener Node no admite acceso directo no previsto. Si no puede acreditarse este límite, no habilitar la interfaz productiva. No se modificó infraestructura para comprobarlo.

Límites en memoria por proceso/credencial única: 120 solicitudes/minuto de ingreso y 30 consultas/minuto autorizadas, independientes de IP reenviada. Reiniciar borra contadores; varias instancias necesitan límite compartido de infraestructura antes de habilitarse. Un tercero puede consumir ingreso y afectar disponibilidad, sin adquirir acceso.

READ ONLY protege las consultas del módulo; el pool conserva configuración DB existente. No se provisionaron usuarios o privilegios MySQL. Usuario SELECT independiente sería defensa adicional posterior. No se realiza auditoría de infraestructura ni de logs externos: deberán ocultar Authorization y respuestas financieras.

Errores: 401 credencial; 403 transporte/origen; 404 período/ruta; 405 método; 413 tamaño; 422 consulta; 429 límite; 503 configuración/concurrencia/consulta. Un error nunca se representa como cero.

## Requisitos verificados para conectar después el Site

Verificación documental con las referencias instaladas de Sites `identity-and-secrets.md`, `site-mcp-server.md` y SKILL; no es prueba del Site particular. Workers admite HTTP externo, sin necesidad de TCP/MySQL. Sites autentica MCP y comprueba acceso; permisos adicionales deben verificarse en servidor. La identidad MCP y el token saliente hacia el CRM son autorizaciones diferentes.

Pasos posteriores sujetos a autorización:

1. Revisar Site existente y confirmar audiencia privada y herramientas. No crear otro Site ni ampliar audiencia.
2. Después de revisión y publicación manual del backend, comprobar HTTPS/proxy, límites y ausencia de logs sensibles. Un Worker no accede al localhost de esta computadora. No se creó túnel.
3. Configurar URL base fija y token original en variables runtime del servidor del Site mediante herramientas nativas de Sites. Mantenerlos fuera de manifiestos, bundles, fuentes, argumentos/resultados MCP y logs.
4. Adaptar `consultar_estadisticas_comerciales`: aceptar solo mes, construir URL fija, hacer fetch servidor a servidor con Bearer, timeout y límite de respuesta, sin seguir redirecciones con credenciales. No aceptar URLs, cabeceras ni SQL del modelo.
5. Validar versión 2.0/contrato; preservar cobertura y disponibilidad empresarial sin reintroducir supresiones; errores MCP explícitos sin headers/token/mensajes internos. Mantener anotaciones de lectura que soporte la herramienta.
6. `consultar_conocimiento_empresarial` sigue ficticia o no disponible: no presentar contenido ficticio como real ni acceder a Markdown privados.
7. Probar autorización, período inexistente, privacidad, conciliación, fallos y revocación antes de uso real.

No se requiere API paga de modelos. No se crearon credenciales reales ni se modificaron variables de servicios externos. Los tokens efímeros de pruebas solo existen en memoria durante las pruebas sintéticas.

## Validación real, exclusivamente de lectura

Script scripts/validate-ai-context-readonly.ts. Requiere RUN_AI_READ_DB_TESTS=true, DB_NAME=prisma_test y host local. Inicia READ ONLY, comprueba SELECT DATABASE() antes de consultar negocio y usa una conexión que solo admite SELECT, sin locks ni exportaciones a archivos. Termina con rollback/liberación. Sin helpers de fixtures, migraciones o escrituras. Credenciales del entorno local solo en memoria, nunca impresas.

MySQL local existente: **70 períodos, todas las conciliaciones aprobadas, sin diferencias**. Comparaciones independientes: miembros/personas/inscripciones, actividad, slots y oferta; combinaciones reconstruidas en memoria sin exportar IDs; cuentas definidas/NULL/ausentes/cero; cobros, deuda, crédito, aplicado e indefinidos; honorarios por acuerdo, pagado/pendiente y motor; gastos por categoría/concepto controlado y total; continuidad. Una única lectura consistente durante la verificación.

Cobertura real: períodos vacíos, miembros sin actividad, varias actividades por persona, cero, NULL, cuenta ausente, pago parcial, crédito, cobros fuera del mes, honorarios indefinidos, cuenta sin asignación actual, gastos adicionales y pares de continuidad.

**Sin cobertura real:** varios horarios en una misma inscripción y gastos recurrentes; no hay casos en los registros existentes de prisma_test. Se prueban con datos sintéticos, sin crear datos para completar cobertura. No representa verificación productiva.

El primer intento en sandbox falló; ejecución autorizada fuera del sandbox completó la lectura. Sin suites DB destructivas. Proxy/HTTPS SiteGround pendiente: sin vulnerabilidad de token demostrada ni garantía de infraestructura a partir de estos tests.

Validación final: typecheck y lint aprobados; suite normal con 330 pruebas aprobadas y 162 casos DB omitidos. Incluye 49 pruebas sintéticas de la interfaz/seguridad y guardas del validador real. Todas las banderas DB se fijaron en false en la suite normal. La lectura MySQL se ejecutó separadamente y pasó las conciliaciones independientes de 70 períodos, también después de comprobar universo y cobertura de acuerdos. Build aprobado con los avisos conocidos no bloqueantes de anotaciones Zod/Rollup. git diff --check aprobado. Sin dependencias ni cambios de frontend. Ejemplo sintético regenerado desde el backend compilado y validado por Zod, sin conexión DB.

[Respuesta sintética 2.0](../examples/ai-monthly-context.synthetic.json): una persona, un acuerdo y un gasto ficticios; no son tarifas ni registros reales.
