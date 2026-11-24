# PWA-3 — corrección puntual de eliminación de actividades previa a CI

24/11/2026. Autorizada exclusivamente la corrección del P3 registrado en
[PWA-2, Etapa 1](2026-11-pwa-2-stage-1.md), pruebas y commit local.
Baseline confirmado: `codex/pwa-2b3-participant-binding`, HEAD
`7b09e3e7118073e825d7562e4f28373cbd3db9c0`, árbol limpio;
main `20777b258b2305d26f4a14807bf91911897fc66c`, sin modificarla.

## Causa y corrección

DELETE `/api/activities/:id` pasa por el guard CRM, `deleteCatalog`,
`peopleTransaction` y `deleteCatalogInDB`. El borrado conserva sus verificaciones
de inscripciones/ofertas y retira días permitidos antes del DELETE de actividad.
Las FK RESTRICT de `education_presential.activity_id` y
`education_digital_rights.activity_id` impiden borrar referencias persistentes,
incluidas fuentes retiradas y derechos vencidos/revocados. El error mysql2
`ER_ROW_IS_REFERENCED_2` no tenía traducción y terminaba en 500 genérico.

`server/configuration-deletion.ts` traduce exclusivamente ese error del DELETE
final de actividades a AppError 409: «La actividad conserva referencias que
impiden eliminarla. Archivala para conservar su historial.» No inspecciona ni
expone SQL, nombres de restricciones o datos. La FK sigue decidiendo la integridad;
no se agregan consultas de tablas educativas en destinos anteriores a 023.
Otros errores y el borrado de facilitadores mantienen su tratamiento anterior.

La excepción sigue dentro de la transacción: rollback también recupera los días
permitidos retirados previamente. Se conservan los locks existentes; no hay
cascadas nuevas, limpieza de historia ni modificaciones de derechos, habilitación,
vínculos o auditoría. El error se comparte con QA mediante el mismo servicio.
La interfaz existente DeleteButton → useSave/api → ErrorBox muestra el mensaje
del servidor en el modal. No se modifica interfaz, estilos ni autorización.

## Regresiones y evidencia

- `tests/activity-deletion.test.ts`: nueve casos sin DB. Rutas HTTP, servicio y
  transacción reales con conexión externa sustituida: FK → 409 y rollback sin
  commit; eliminación legítima; otros errores e instructores sin cambio; guard
  rechaza ausencia/rechazo de credencial; Origin ajeno; mensaje a través del API
  cliente y render del ErrorBox. El doble de autenticación representa rechazo,
  no acredita expiración/revocación real ni un recorrido OAuth.
- Ciclo rojo/verde: inicialmente 500 en las dos aserciones nuevas de conflicto/API;
  siete casos ya pasaban. Después de la corrección, nueve aprobados. El primer
  intento restringido falló por EACCES de loopback; repetido fuera del sandbox
  sin DB para reproducir el defecto real del contrato HTTP.
- Ejecución focalizada final: `npm run test:unit -- tests/activity-deletion.test.ts
tests/configuration.test.ts tests/auth.test.ts tests/identity-isolation.test.ts
tests/education-db.test.ts`: **23 aprobadas, 14 omitidas**, cuatro archivos
  aprobados y uno DB omitido. Runner conserva guardas y desactiva opt-ins DB.
- `tests/education-db.test.ts`: seis casos MySQL nuevos en la entrada aislada
  existente, sin modificar CI. Cinco rechazos: digital vigente/vencido/revocado,
  presencial habilitada/retirada; comparan actividades, días permitidos y las cinco
  tablas educativas completas. El sexto elimina una actividad sin dependencias
  conservando auditoría educativa. La suite pasa de ocho a catorce casos; no se
  atribuyen a este cambio los ocho ensayos MySQL históricos de 2B.3.
- Typecheck y lint aprobados. Prettier limitado a archivos afectados y diff-check
  como controles de cierre. Revisión adicional de código sin hallazgos accionables.

Sin MySQL ejecutado, creado o conectado; los catorce casos quedan pendientes de
la matriz CI acreditada según WORKFLOW §6. El test sin DB verifica el llamado al
rollback real del servicio; la conservación efectiva en InnoDB queda cubierta por
las nuevas regresiones preparadas, todavía sin ejecutar. Sin build, suite completa,
navegador ni prueba manual: validación acotada conforme al pedido. La comprobación
de UI es de contrato API/render, no una aceptación visual interactiva.

## Estado y riesgos residuales

Implementada y probada localmente sin DB; sin nuevas migraciones ni modificación
de SQL histórico, CI, política educativa, main, producción, PWA-1D o prototipo V2.
No aplicada 023 ni activado `/app/`. Un único commit local para este alcance.

**APTO CON OBSERVACIONES para publicar la rama candidata y ejecutar CI remoto**,
con autorización posterior y push manual del propietario. Observación principal:
regresión MySQL todavía no ejecutada; no bloquea publicar una rama no productiva
para validarla, pero no permite declarar integración/despliegue aprobados.
La conservación depende de las FK y transacción existentes; no se certifica una
DB externa ni un esquema parcial. Antes de integrar, aprobar verify y las ocho
suites aisladas del SHA final, además de la aceptación pendiente del candidato.
Migración productiva y activación continúan como operaciones separadas.
