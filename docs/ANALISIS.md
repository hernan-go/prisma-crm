# Análisis de las referencias

Se inspeccionaron las nueve hojas del Excel y las dos páginas renderizadas del PDF. Los documentos son referencias de datos y navegación; el alcance autoritativo es el pedido de PRISMA CRM.

## Excel

Personas tiene 1003 filas declaradas y 27 columnas, pero gran parte son formato, identificadores vacíos o casillas. Encabezados en fila 3: ID, Nombre y apellido, DNI, Teléfono, Dirección, PAGO, TRANS, EFECTIVO. No inferir personas de filas que solo tienen ID/casillas.

La vista previa reproducible encuentra 32 personas, 31 con campos requeridos presentes y 1 incompleta; todas tienen nombre combinado y requieren revisión. No hay duplicados fuertes por teléfono/DNI/email entre las filas actuales. Los números locales se preservan tal como están: no inventar códigos de área para números cortos.

Gestión mensual mezcla un mes con columnas por actividad y turno. Las hojas Yoga, Movimiento, Memoria e Inclusión son vistas por docente. En el CRM estas vistas usan las mismas relaciones normalizadas, sin copias físicas.

INVERSIÓN PUBLICIDAD tiene diez registros sin encabezado: fecha en A, concepto en B, importe en C, notas en D y ocasionalmente F. Los importes están como texto con símbolo monetario y separadores mixtos. Las notas describen cortes de campañas y crédito reutilizado, pero no definen un libro contable de saldos. Se modelan fecha, concepto, monto y notas, sin cartera publicitaria ni compensaciones automáticas.

Existe una campaña histórica de Inglés, pero el pedido excluye esa actividad. No se crea Inglés en configuración ni se importa esa campaña automáticamente. Confirmar con administración si quiere conservar ese registro solo como historia publicitaria.

Pago talleristas e Inversiones quedan fuera del alcance, como se pidió.

## PDF

La primera página propone dashboard, base de personas, pagos y gestión mensual; la segunda muestra vistas por docente, actividad, día y horario. Se conserva la intención, sustituyendo pestañas por docente y grillas anchas por filtros y tarjetas de inscripción.

## Decisiones pendientes de datos reales

- Confirmar las 32 separaciones de nombres y apellidos y completar el registro incompleto.
- Conciliar pagos históricos: PAGO más casillas no prueba monto individual por medio ni fecha. No inventar movimientos.
- Confirmar si se requiere migración histórica de inscripciones y campañas; la migración incluida es de personas.
- Confirmar códigos de área ausentes solo con cada registro; no alterarlos automáticamente.
- Acordar retención de backups y confirmar parámetros de conexión/startup del panel SiteGround.

El archivo fuente no fue modificado. No se incluyeron datos personales reales en seeds ni en archivos versionables.
