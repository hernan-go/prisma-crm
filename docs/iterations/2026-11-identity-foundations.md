# Iteración 12 — Etapa 1: fundamentos de identidad institucional

Estado: implementada y comprobada localmente el 08/11/2026, consolidada para commit local autorizado, sin publicación. Iteración 12 abierta. Rama `codex/iteration-12-identity-foundations`, base `1d0d402`; conserva `452b334` y `1d0d402`.

## Alcance y arquitectura

`server/identity.ts` es un servicio interno confiable, sin router ni importación desde el flujo operativo. No valida pruebas Google ni autoriza al actor de las mutaciones: ese límite debe cubrirlo la Etapa 2 antes de exponer operaciones. `actor_id=null` identifica una operación interna sin actor individual; nunca equivale a un administrador implícito. No hay bootstrap de usuarios reales, recuperación, UI, API para otro Node ni nuevos privilegios en el CRM.

017 agrega cinco tablas InnoDB: `identity_users`, `identity_external_accounts`, `identity_user_roles`, `identity_sessions`, `identity_audit_events`. UUID estable independiente de personas/facilitadores. Alta deshabilitada; estados enabled/disabled. Identidad externa única por proveedor/subject y una por usuario/proveedor; el servicio admite Google exclusivamente, sin normalizar ni fusionar por email. Roles explícitos admin/facilitator/participant, sin concesiones por defecto ni motor configurable. Las etiquetas futuras no habilitan funcionalidades educativas.

Sesiones con token aleatorio de 256 bits, SHA-256 persistido, aplicación, creación, vencimiento y revocación. Solo `crm` se admite actualmente y exige admin habilitado. TTL explícito positivo hasta ocho horas. No es todavía una política de UI aprobada. Consultas de sesión vuelven a comprobar usuario, rol, aplicación y vencimiento, sin caché de privilegios. Múltiples sesiones admitidas; revocación individual o de todas. Cambiar estado o roles revoca todas; reactivar/reconceder no resucita sesiones anteriores.

Cada mutación y la autenticación serializan por fila de usuario, con lecturas actuales `FOR UPDATE`. Las restricciones únicas arbitran vínculos concurrentes entre usuarios diferentes. Auditoría y mutación comparten transacción; falla de auditoría revierte la operación. Eventos contienen usuario/actor/tipo/fecha, sin tokens, correos ni subject. Cambios de roles incluyen el rol en el tipo de evento. No se auditan consultas rutinarias. Una petición ya autorizada antes de una revocación no queda retrospectivamente cancelada; cualquier futura operación sensible necesita su propia comprobación transaccional. Consumidores futuros no deben guardar indefinidamente el objeto de identidad.

FK sin cascadas destructivas. No se alteran tablas operativas ni `admin_sessions`; las sesiones antiguas no reciben usuario. Código de auth/app y frontend intacto. Sin dependencias nuevas. No hay almacenamiento de intentos OAuth: corresponde a Etapa 2.

## Migración y recuperación

017 requiere 016 registrada. El runner rechaza cualquiera de las cinco tablas existente sin registro 017, antes de ejecutar DDL. Replay con registro se omite como en el runner vigente: NO constituye verificación automática del DDL. MySQL no revierte DDL mediante rollback.

Ante parcial: detener, inspeccionar estructura/datos y comparar cada sentencia con 017. Si existen datos legítimos, preservarlos; completar DDL faltante mediante procedimiento revisado y registrar solo tras postflight. No ejecutar DROP ni marcar aplicada a ciegas. Para volver al código anterior conservar las tablas aditivas; no restaurar toda la DB empresarial por un fallo de identidad. No se implementa un down destructivo.

017 aplicada y replay comprobado exclusivamente en prisma_test. La integración verifica DB_NAME, host local y SELECT DATABASE() antes de escribir, exige 016 y conserva el esquema previo y las filas de admin_sessions. Fixtures sintéticos propios eliminados en orden de FK; esquema 017 conservado. Ninguna migración en dev/demo/producción. 017 permanece idéntica a la aplicada. El escenario parcial probado es esquema completo sin registro; no se ensayó interrupción física del servidor durante cada sentencia DDL.

## Validación

Actualización de cierre: la suite prepara ahora explícitamente 001–016 mediante `migrate('016.sql')` después de validar host/DB destino, antes de inspeccionar el esquema previo y aplicar 017. No depende del orden de otras suites ni reinicializa datos. Runner productivo y 017 no cambiaron por esta corrección. Integración final en prisma_test existente aprobada; no hubo destino MySQL vacío autorizado, por lo que el arranque CI desde cero sigue pendiente de comprobación real. No se borró ni creó otra base. Los resultados generales siguientes corresponden al corte inicial de identidad; las correcciones independientes de frontend y su validación se registran en su propio documento y commit.

- Typecheck, lint y build aprobados; avisos conocidos de Zod/Rollup.
- Focalizadas finales: 16 aprobadas en cuatro archivos (identidad unitaria, integración MySQL, aislamiento HTTP, auth heredada).
- Integración: unicidad concurrente, FK/CHECK, vínculo idempotente/no reasignable, rollback de auditoría, emisión/suspensión concurrentes, roles, sesión individual/total, vencimiento, aplicación, no resurrección, migración/replay y rechazo sin registro.
- Suite general: 583 aprobadas, 218 omitidas, dos fallos en dashboard.test.ts. Fixture crea horario del domingo actual; Dashboard usa lunes como selección dominical (`date.day || 1`), omitiendo nombres esperados. Test y componentes no modificados. La suite general NO está completamente aprobada; no se corrigió frontend ajeno al alcance.
- No QA visual: no hay cambios de interfaz. No autenticación Google real ni pruebas productivas.
- Vitest necesitó ejecución fuera del sandbox por EPERM al renombrar caché; el intento bloqueado no ejecutó tests.

Dictamen: APTO CON OBSERVACIONES para consolidación local autorizada de Etapa 1; no habilita publicación ni Etapa 2. El ensayo MySQL vacío permanece pendiente.

## Pendientes Etapa 2 y 13

Antes de habilitar Google: aprobar y desarrollar vinculación supervisada de las dos cuentas, validar firma/emisor/audiencia/nonce/state/PKCE mediante biblioteca, intentos de un solo uso, cookies/CSRF, autorización de actores, protección concurrente del último admin, recuperación y transición con retiro definitivo del login compartido. Los servicios internos de esta etapa NO implementan protección del último administrador ni sustituyen esos controles.

Seguirán pendientes retención/purga de sesiones y auditoría, política administrativa de duración, dominio/callback y plan de publicación/contingencia. Auditoría actual no es un registro inalterable frente al administrador de DB. No hay promesa de revocación retroactiva de solicitudes en curso ni resistencia total a compromiso del servidor.

Para 13: usuario estable, roles múltiples y aplicación en sesiones como base. Postergados vínculos people/instructors, protocolo entre Nodes, API protegida, sesiones de nuevas aplicaciones, Passkeys, PWA, contenidos y derechos digitales. No compartir cookies ni aceptar roles declarados por el cliente.
