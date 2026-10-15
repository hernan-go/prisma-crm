# Rediseño mobile

> Cierre posterior confirmado por el propietario el 2026-10-15: implementación integrada, desplegada y aprobada en producción. Este cierre supera los pendientes de Git/deploy del registro histórico siguiente. La eliminación satisfactoria del período noviembre de 2026 también fue confirmada.

**Fecha:** 2026-10-08. **Base:** `df04f17`. **Rama:** `feat/mobile-redesign`.
**Estado:** completada localmente; validaciones automáticas y revisión visual manual final aprobadas por el usuario. Cierre documental completado. Sin add, commit, push ni merge autorizados; sin deploy de esta iteración.

## Alcance aprobado

- Nuevo diseño solo en `max-width: 700px`. Conservar tablet/desktop desde `701px`.
- Header mobile común en todas las secciones, en flujo normal y sin sticky/fixed: PRISMA + hamburguesa / título + ayuda / período + selector + creación `+`. Estadísticas conserva solo su título, sin ayuda inventada. La fila de período comparte alineación vertical, altura y gap entre rutas.
- Dashboard conserva marca PRISMA sin subtítulo, Nueva inscripción, métricas 2x2 y resto apilado. Los CTAs principales quedan alineados a izquierda en mobile.
- Selector reutiliza el estado de App y PeriodContext, sin nuevas fuentes de verdad ni cambios de creación/clonado.
- Menú no fullscreen, debajo de la franja superior, con nueve rutas e íconos actuales. Se cierra al seleccionar, tocar fuera, pulsar hamburguesa o Escape; navegación por teclado y sección activa. Scroll vertical interno en alturas limitadas. Cerrar sesión al final, separado y con colores oliva existentes.
- Ayudas cuadradas accesibles con descripciones existentes; cierre por botón, fuera y Escape. Descripciones permanentes en tablet/desktop. Estadísticas conserva solamente su título, sin ayuda inventada.
- Personas: Nueva persona e Incluir archivadas en una fila, buscador debajo e Importar como enlace secundario. Solo Persona/Teléfono/Estado; estado como punto verde/rojo con nombre accesible. Enlaces ampliados a ficha y nombres hasta dos líneas.
- Cobros: Registrar pago alineado a izquierda; solo Persona/A cobrar/Saldo. Cero verde, deuda roja, crédito y no definido diferenciados. Ficha/cuenta y movimientos accesibles; cálculos y operaciones intactos.
- Agenda: filtros 2x2, una columna debajo de 360px; cards actuales y todos los asistentes.
- Gastos: Nueva inversión, categorías y movimientos actuales; vacío mobile simplificado sin ocultar categorías existentes.
- Inscriptos, Pago Facilitadores, Configuración, ficha, importadores y modales: ajustes conservadores de reflujo, lectura y controles.
- Footer oculto solo en mobile. Desde `701px` se conserva el sistema anterior de tablet/desktop.
- Pulido final aprobado: ítems inactivos del menú con `#becac7` de la paleta existente, activo destacado y cierre de sesión oliva; label completo de Incluir archivadas clickeable con superficie de 44px, sin agrandar el checkbox.

## Límites técnicos

CSS nuevo acotado a teléfono; sin ocultar overflow de la página como solución. Paleta, tipografía e íconos existentes. Sin nuevas dependencias, cambios en package.json/package-lock, SQL, migraciones, APIs ni reglas financieras/operativas. No modificar `009.sql`. No crear datos ficticios. Sin pruebas destructivas DB.

## Validación y revisión

Validación automática: Prettier una sola vez sobre los archivos tocados compatibles; typecheck y lint aprobados; tests existentes con 116 aprobados y 114 de integración omitidos; build aprobado (warnings conocidos de Zod/Rollup); git diff --check aprobado. Vitest y Vite requirieron reintento fuera del sandbox por EPERM al resolver archivos. Integración DB explícitamente desactivada.

Revisión local realizada sobre `prisma_dev`, sin seeds, datos ficticios, cambios DB, migraciones ni lógica de negocio. Frontend `http://localhost:5173`; backend `http://127.0.0.1:3001`. Servidores detenidos al cierre documental por pedido del usuario.

Revisión visual manual final aprobada explícitamente por el usuario: mobile 390×900 con menú cerrado/abierto y todas las secciones principales; breakpoint 700px y frontera 701px; tablet 768px y tablet/notebook 1024px. Sin overflow horizontal observado; header, menú, CTAs y tablas/listados mobile aprobados. Desde 701px reaparece correctamente el layout anterior; tablet y desktop preservados. La aprobación corresponde a estas comprobaciones, sin atribuir una matriz adicional al usuario.

## Deuda documental anterior

Confirmación explícita del usuario: `009.sql` aplicada y registrada en producción; `main` productivo anterior `df04f17`; deploy `1791429132-5kurej`; build exit code `0`; smoke productivo aprobado e históricos agosto/septiembre/octubre reconciliados correctamente. Se actualizan AGENTS, PROJECT_STATE, DECISIONS, ROADMAP y cierre de Cobros dentro de esta iteración. Sin commit/deploy exclusivo documental ni nuevas acciones sobre producción/SiteGround.
