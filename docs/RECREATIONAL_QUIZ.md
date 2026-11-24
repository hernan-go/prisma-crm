# PRISMA CRM — Multiple Choice recreativo

PWA-3A.5 · 24/11/2026. Especificación funcional y arquitectónica aprobada por el
propietario para el futuro MVP educativo; **no implementada**. Baseline local:
`codex/pwa-2b3-participant-binding`, `2a811e3`, árbol inicialmente limpio.
Esta intervención registra criterios: no crea banco de preguntas, código,
componentes, endpoints, migraciones ni pruebas funcionales.

## Propósito y alcance

Actividad recreativa y educativa, especialmente accesible para personas +50.
No otorga certificaciones, premios económicos, reconocimientos verificables ni
beneficios que dependan de la integridad del resultado. No incorpora cronómetro,
penalizaciones, rankings ni competencia entre personas.

El banco inicial objetivo es de aproximadamente 300 preguntas, ampliable mediante
Markdown. Abarca cultura general, geografía, espectáculos, tecnología, memoria,
razonamiento, matemáticas sencillas, adivinanzas y desafíos cognitivos. Combina
dificultades y alternativas plausibles. Cada pregunta tiene tres opciones y una
única respuesta correcta con criterio objetivo; evitar ambigüedades, respuestas
discutibles y conocimientos temporales sin contexto suficiente.

## Ronda y devolución

- Cada ronda selecciona aleatoriamente 15 preguntas distintas. Mezcla también las
  alternativas y sus etiquetas visibles A/B/C en cada aparición, preservando la
  asociación con la opción correcta. No garantiza que una mezcla nueva difiera de
  la anterior.
- La persona elige una opción y la confirma una sola vez para esa aparición.
  Confirmada la respuesta, queda bloqueada para impedir dobles envíos o cambios
  que alteren el resultado. Puede responder de nuevo si la pregunta aparece en
  otra ronda.
- La devolución inmediata indica únicamente acierto o error. No marca ni revela
  la respuesta correcta, no muestra explicación que la descubra y no ofrece un
  solucionario posterior.
- La barra de progreso acompaña el avance de las 15 preguntas con texto legible.
  Los mensajes motivadores son respetuosos y no introducen presión ni comparación.
- Al terminar, muestra solo el resultado global, por ejemplo 11/15, sin desglose
  de preguntas. Una nueva ronda está disponible inmediatamente.

## Arquitectura aprobada e intercambio aceptado

Selección, mezcla y corrección pueden ejecutarse íntegramente en el navegador.
El banco se redacta en Markdown versionado, se valida y transforma durante el
build y se distribuye como recurso estático, preferentemente separado del bundle
inicial. Se priorizan baja latencia, devolución inmediata, menos peticiones HTTP
y consultas MySQL, menor carga de hosting y mantenimiento sencillo, con buen
funcionamiento en dispositivos modestos.

**Se acepta expresamente la inspección técnica del banco y sus respuestas
correctas mediante herramientas del navegador.** Ocultar la solución en la
interfaz es una regla de experiencia; las respuestas distribuidas no son secretas.
Esta es una decisión proporcionada al carácter recreativo, no un accidente, una
limitación desconocida ni una vulnerabilidad del sistema de autorización.

El MVP inicial no requiere consultas MySQL por respuesta ni persistencia
individual de puntajes, intentos o resultados. El estado de la ronda puede
permanecer en memoria; la implementación debe comunicar qué ocurre al recargar o
cerrar la página, sin prometer recuperación de una ronda no guardada. No agregar
telemetría personal ni almacenamiento innecesario.

Si aparecen evaluaciones formales, premios, certificaciones o resultados
verificables, revisar previamente corrección, seguridad y persistencia. Este
acuerdo se limita al cuestionario recreativo y resuelve para él la alternativa
abierta en PWA-3A.4; no fija el diseño de futuras evaluaciones formales.

## Contrato editorial y transformación futura

Definir el formato exacto de Markdown al implementar, con estos criterios:

- Identificador estable y único por pregunta, independiente de la redacción y
  del orden visible. Cada opción debe conservar una identidad independiente de
  A/B/C para corregir después de mezclar.
- Campos de consigna, categoría, dificultad, tres opciones distintas y una única
  referencia correcta. Validar metadatos, campos vacíos, formato y referencias.
- Rechazar IDs repetidos, opciones duplicadas y duplicados estructurales de
  preguntas tras normalizar espacios y diferencias de formato. Complementar con
  revisión editorial para detectar equivalencias semánticas y respuestas ambiguas.
- La transformación debe fallar con diagnóstico de ubicación ante contenido
  inválido; no publicar silenciosamente un banco incompleto. Debe haber al menos
  15 preguntas válidas para iniciar una ronda sin duplicados.
- Tratar el contenido como datos; no admitir scripts ni ejecución de código
  arbitrario desde Markdown.

Editar el Markdown versionado implica generar y publicar una nueva versión del
contenido. Esta arquitectura no permite a un facilitador modificar el banco en
producción desde el CRM: eso requeriría otro mecanismo expresamente diseñado.
La planificación de publicación docente de clases y recursos sigue vigente.

## Selección, carga y datos locales

La implementación deberá seleccionar sin reemplazo y mezclar con un algoritmo
adecuado, sin sesgos introducidos por ordenar con un comparador aleatorio.
Equilibrar categorías y dificultades según la disponibilidad real, sin fijar
cuotas que vuelvan imposible completar 15 preguntas. Las cuotas concretas quedan
para la implementación; ante escasez, relajar el equilibrio conservando unicidad.

Para reducir repeticiones recientes, recomendar una lista acotada de IDs vistos
en memoria del navegador, sin identificar al participante. Si se acuerda
conservarla entre visitas, guardar únicamente IDs/versionado y un límite de
vigencia/tamaño local; no respuestas, puntajes ni perfiles. Si el almacenamiento
no está disponible, el juego debe seguir funcionando. Con pocos candidatos,
relajar primero la exclusión de preguntas menos recientes. No prometer ausencia
de repeticiones entre dispositivos, personas que comparten navegador o visitas.

Cargar el banco de forma diferida al entrar al juego y reutilizar su caché por
versión, sin incluirlo entero en el bundle inicial. Vincular versión de banco y
formato para evitar cachés incompatibles; mantener una versión coherente durante
la ronda. Definir estados de carga y error recuperable, sin iniciar una ronda
parcial o inventar resultados ante un fallo. La caché no constituye por sí sola
una promesa de funcionamiento offline.

## Accesibilidad y separación de acceso

Controles amplios, tipografía legible, contraste suficiente, foco visible,
navegación completa por teclado y etiquetas claras para opciones y confirmación.
Comunicar acierto/error y progreso mediante texto y anuncios accesibles, sin
depender solo del color, animación o sonido. Respetar movimiento reducido y dar
tiempo libre para leer y avanzar; evitar saltos automáticos que oculten devolución.

La distribución estática contiene únicamente el banco recreativo inspeccionable;
no debe incluir datos personales, credenciales ni materiales educativos privados.
No usar una URL estática pública como barrera de acceso a contenido protegido.
Autenticación educativa, autorización por actividad y protección de datos siguen
siendo requisitos del portal. La implementación debe distinguir la distribución
del banco recreativo del acceso protegido a clases y recursos, con controles
efectivos para estos últimos. Poder inspeccionar el banco no concede acceso a
otras actividades ni permite eludir esas autorizaciones.

## Estado y dependencias

La implementación requiere una iteración posterior autorizada, creación y revisión
del banco, transformación de build y experiencia accesible de juego. La entrega
educativa integral conserva sus dependencias de clases, recursos, autenticación,
accesos por actividad y publicación docente del [roadmap](ROADMAP.md).
No ampliar `023.sql` ni crear tablas de cuestionarios, calificaciones o intentos
para este juego. No se altera el piloto institucional ni se autoriza activación.

Decisión registrada en [DECISIONS](DECISIONS.md); referencia de integración en
[ARCHITECTURE](ARCHITECTURE.md). La verificación de esta intervención se limita a
coherencia documental, enlaces y diff; no acredita implementación o QA funcional.
