# VANTY School — documento de contexto

> **Para qué sirve este documento.** Explica qué es VANTY School, qué hace cada parte y cómo se conectan entre sí. Está escrito para entregárselo a un asistente de IA (por ejemplo ChatGPT) o a una persona nueva en el proyecto, de modo que pueda responder preguntas y proponer cambios sin ver el código.
>
> **Estado:** versión 0.1 (MVP) preparada para Jump Chile 2026. Actualizado el 12 de octubre de 2026.
>
> **No contiene** claves, contraseñas ni datos reales. Todos los datos del colegio de demostración son ficticios.

---

## 1. Qué es VANTY School

VANTY School es una plataforma web para colegios de Chile que reúne en un solo lugar:

- **La gestión académica**: cursos, asignaturas, tareas, pruebas, notas y asistencia.
- **La comunicación** entre el colegio, las familias y los estudiantes: mensajes, comunicados, reclamos y denuncias.
- **El bienestar escolar**: solicitudes de apoyo, casos de acompañamiento y cuestionarios para las familias.
- **ARIA**, una asistente de inteligencia artificial que ayuda a cada rol con información que ese rol tiene permitido ver.

Es **multi-colegio**: muchos colegios usan la misma plataforma y ninguno puede ver datos de otro.

Forma parte del ecosistema Vanty, junto con VANTY ABA (una plataforma clínica distinta). Son proyectos y bases de datos **separados**: VANTY School nunca lee ni comparte información de pacientes de VANTY ABA.

---

## 2. Quiénes la usan (roles)

Cada persona pertenece a un colegio con **un rol**. El rol decide qué menú ve y qué datos puede leer o cambiar.

| Rol interno | Nombre en pantalla | Para qué entra |
|---|---|---|
| `admin` | **Secretaría** | Administra personas, cursos, asignaturas y matrículas del colegio. |
| `directivo` | **Director(a)** | Supervisa el rendimiento del colegio, a los docentes y gestiona reclamos y denuncias. |
| `docente` | **Docente** | Lleva sus cursos: tareas, evaluaciones, notas, asistencia y repasos. |
| `bienestar` | **Bienestar escolar** | Atiende solicitudes de apoyo, lleva casos y aplica cuestionarios. |
| `apoderado` | **Apoderado** | Sigue a sus pupilos y se comunica con el colegio. |
| `estudiante` | **Estudiante** | Ve y entrega sus tareas, revisa notas y asistencia, repasa y pide ayuda. |

No existe registro público: toda cuenta nace de una **invitación** que crea Secretaría (o Dirección, solo para docentes).

---

## 3. Qué puede hacer cada rol

### 3.1 Secretaría (`/admin`)
- **Inicio**: matrícula por grado, pendientes (fichas incompletas, decisiones de continuidad).
- **Usuarios**: invitar personas, ver y editar su ficha (RUN, domicilio, contacto de emergencia), cambiar rol, desactivar, retirar del colegio, y tramitar solicitudes de eliminación (anonimización).
- **Gestión académica**: grados, secciones, catálogo de asignaturas, qué asignaturas lleva cada sección y qué docente las imparte, periodos.
- **Matrículas**: quién está en cada curso, asignar o cambiar de curso, retirar, decidir la continuidad para el año siguiente y **cerrar el año escolar**.
- **Comunidad** y **Configuración** del colegio (incluye el protocolo de urgencia y el uso de ARIA).

Secretaría **no ve nada técnico** ni información de bienestar.

### 3.2 Director(a) (`/direccion`)
- **Inicio**: promedio general, asistencia, entregas a tiempo, estudiantes en alerta, asuntos pendientes y actividad de la semana.
- **Cursos y estudiantes**: mapa de todos los grados y secciones; ficha de cada curso y de cada estudiante.
- **Docentes**: directorio, carga de cada docente y la evaluación mensual que hacen sus estudiantes.
- **Rendimiento**: análisis por asignatura, evaluación, alumnado y docente, con filtros por grado y sección.
- **Reclamos y denuncias**: bandeja exclusiva de dirección, con estado, gravedad, responsable y notas.
- **Comunidad** y **ARIA Gestión**.

### 3.3 Docente (`/docente`)
- **Inicio**: lo que tiene por revisar, próximas entregas y sus cursos.
- **Mis cursos**: por cada curso y asignatura tiene cuatro pestañas:
  - *Tareas y evaluaciones*: crear tareas (con entrega en la plataforma) o evaluaciones (prueba, examen, control, exposición) con porcentaje opcional; calificar.
  - *Estudiantes*.
  - *Libro de notas*: promedio por estudiante, ponderado si las evaluaciones tienen porcentaje.
  - *Repaso*: misiones de repaso para el curso y los repasos que sus estudiantes crearon con ARIA.
- **Asistencia**: pasar lista por día y revisar el registro del año.
- **Comunidad**, **Mensajes**, **Reclamos y denuncias** (para presentar los propios) y **ARIA Pedagógica**.

### 3.4 Bienestar escolar (`/bienestar`)
- **Solicitudes**: lo que piden estudiantes, apoderados y docentes; puede fijar prioridad, asignarse, dejar notas internas o responder a quien solicitó.
- **Casos**: acompañamientos con intervenciones, seguimiento y análisis de ARIA guardados dentro del caso.
- **Evaluaciones**: instrumentos propios, plantillas de cuestionarios para familias, envío a apoderados e historial.
- **Mensajes**, **Reclamos y denuncias** y **ARIA Bienestar**.

### 3.5 Apoderado (`/apoderado`)
- Arriba elige **a cuál de sus pupilos está viendo**; todo el panel se filtra por esa elección.
- **Inicio** y **Seguimiento escolar**: notas, asistencia y tareas del pupilo, con un resumen en palabras simples.
- **Mensajes** con docentes, **Acompañamiento** (pedir apoyo a bienestar, responder cuestionarios, ver lo que su pupilo pidió por su cuenta), **Reclamos y denuncias**, **Comunidad** y **ARIA Familias**.

### 3.6 Estudiante (`/estudiante`)
- **Tareas y pruebas**, **Mis notas**, **Mi asistencia**.
- **Repaso de clases** («Repasemos»): misiones con videos y preguntas; también puede pedirle a ARIA un repaso propio.
- **Evaluar mis clases**: encuesta mensual anónima sobre cada asignatura.
- **Pedir apoyo**, **Mensajes** (solo responde; no inicia), **Reclamos y denuncias**, **Comunidad** y **Mi perfil**.

**Dos modos de visualización:**
- **Modo simple** (1.º a 6.º básico y parvularia): letra grande, pocas cosas por pantalla, lenguaje de niño, mascota y estrellas.
- **Modo completo** (7.º básico en adelante): más información y un tono más sobrio.

El estudiante puede cambiarlo en «Mi perfil». «Crear con ARIA» está disponible desde 3.º básico.

---

## 4. Cómo se conecta todo (flujos entre roles)

Esta es la parte central: qué pasa cuando alguien hace algo y a quién le llega.

### 4.1 Tareas, entregas y notas
1. El **docente** crea una tarea o evaluación para un curso y asignatura.
2. El **estudiante** del curso la ve; si es tarea, la entrega (texto y archivo opcional). Las evaluaciones se rinden en clases y no tienen entrega.
3. El **docente** califica (nota de 1,0 a 7,0; se aprueba con 4,0) y deja un comentario.
4. La nota la ven el **estudiante** y su **apoderado**, y entra a los indicadores de **Dirección**.

### 4.2 Asistencia
El **docente** pasa lista → la ven el **estudiante** y su **apoderado** → Dirección ve la asistencia del curso y del colegio.

### 4.3 Mensajes
- El **apoderado** escribe al docente de su pupilo; el docente responde.
- El **docente** puede escribirle a un **estudiante**; sus apoderados quedan incluidos automáticamente en la conversación.
- Un estudiante no puede iniciar conversaciones; solo responder.

### 4.4 Reclamos, denuncias y sugerencias
Cualquier rol puede presentar uno (con archivos de evidencia opcionales). **Solo Dirección** ve la bandeja, define gravedad y responsable, y puede responderle a quien reportó. Las notas internas no las ve quien reportó.

### 4.5 Bienestar
1. Un **estudiante**, un **apoderado** o un **docente** envía una solicitud de apoyo.
2. **Bienestar** la recibe, fija prioridad y responde o deja notas internas.
3. Si amerita, abre un **caso de acompañamiento** (también puede registrar un caso directo).
4. Puede enviar un **cuestionario a la familia**; el apoderado lo responde y la lectura profesional queda solo para bienestar.

**Quién ve una solicitud hecha por un estudiante:**
- El propio estudiante y el equipo de bienestar, siempre.
- Su apoderado **también**, salvo dos casos: si el tema es «situación en casa» (nace reservada) o si bienestar decide reservarla.
- Las respuestas de bienestar son solo para el estudiante.
- Secretaría, Dirección y los docentes no ven solicitudes de bienestar.

### 4.6 Repaso de clases
- El **docente** arma misiones para un curso y asignatura: videos de YouTube (se ven dentro de la plataforma) y preguntas de alternativas. Al publicarla, la ven los estudiantes del curso.
- El **estudiante** puede pedirle a **ARIA** un repaso propio sobre un tema: recibe un resumen, un video y cinco preguntas. Ese repaso es solo suyo; su docente de la asignatura lo puede revisar y eliminar.
- Las respuestas correctas nunca llegan al navegador del estudiante: se corrigen en el servidor. No lleva nota.

### 4.7 Evaluación de las clases
Cada mes los **estudiantes** evalúan cada asignatura en seis aspectos (claridad, ritmo, participación, retroalimentación, organización, trato). **Dirección** ve solo promedios, y solo cuando hay **cinco o más respuestas**; los comentarios escritos aparecen recién con **diez o más** en el mes. Nadie ve quién respondió qué.

El **docente** también participa: en «Evaluación de mis clases» ve sus propios promedios (nunca comentarios ni respuestas individuales), lee la lectura de ARIA cuando Dirección decide compartírsela, y registra las **estrategias** que va a aplicar, con su estado y una nota de cómo le fue. Dirección ve esas estrategias para acompañar, pero no las edita.

Cada lectura de ARIA se **verifica antes de guardarse**: si sugiere sanciones, califica a la persona o le atribuye una condición de salud, se pide de nuevo; si insiste, se descarta.

En el Inicio de Dirección aparece el pendiente **«Docentes cuyas clases podrían necesitar apoyo»** cuando la evaluación del mes de un docente queda bajo 3,5 de 5 o baja medio punto o más frente al mes anterior (con al menos cinco respuestas). Es un aviso para conversar y apoyar: no dispara ninguna acción automática. Desde la ficha del docente, Dirección puede pedirle a ARIA una lectura de mejora, que se guarda y se compara mes a mes.

### 4.8 Comunidad
Secretaría, Dirección y docentes publican comunicados para todo el colegio o para un curso, eligiendo a qué roles van dirigidos y quién puede comentar. Hay reacciones, comentarios y respuestas a comentarios.

### 4.9 Ciclo del año escolar
Secretaría registra la decisión de cada estudiante (continúa, repite, no continúa) y cierra el año: los estudiantes pasan al grado siguiente, los del último grado egresan y se crean los cursos del año nuevo. Las notas y la asistencia anteriores se conservan como historial.

---

## 5. ARIA, la asistente de IA

ARIA tiene un modo por rol. En todos los casos el **servidor** arma el contexto con datos que ese usuario ya tiene permitido ver; el modelo nunca consulta la base de datos por su cuenta.

| Modo | Quién lo usa | Con qué información trabaja |
|---|---|---|
| ARIA Pedagógica | Docente | Resultados **agregados** de un curso y asignatura, sin nombres de estudiantes. |
| ARIA Gestión | Dirección | Rendimiento por nivel y asignatura, asistencia por curso y evaluación de clases. |
| ARIA Bienestar | Bienestar | Antecedentes del caso que está abierto. |
| ARIA Familias | Apoderado | La situación escolar de su propio pupilo. |
| Crear con ARIA | Estudiante (desde 3.º básico) | Solo la asignatura, el nivel y el tema que escribió. |

**Reglas que ARIA no rompe:**
- No emite diagnósticos médicos, psicológicos ni psicopedagógicos, ni inventa instrumentos clínicos.
- Propone y da puntos de vista; no decide ni da órdenes. Las decisiones son del profesional.
- No recomienda sanciones ni decisiones automáticas de alto impacto.
- Ante una situación de riesgo, indica activar el protocolo del colegio y contactar a un adulto.
- Trata lo que escribe el usuario como dato, no como instrucción.

**Controles técnicos:** cupo diario por usuario que fija cada colegio, registro de cada consulta, y validación de la respuesta antes de mostrarla. Si un proveedor falla, se intenta con el siguiente. ARIA también puede leer sus respuestas en voz alta.

---

## 6. Arquitectura técnica

### 6.1 Tecnologías
- **Next.js 16** (App Router) con **React 19** y **TypeScript**.
- **Tailwind CSS v4** para estilos y **motion** para animaciones.
- **Supabase**: base de datos PostgreSQL, autenticación y almacenamiento de archivos.
- **Vitest** para pruebas automáticas (60 pruebas, la mayoría de permisos contra la base real).
- Proveedores de IA: **Groq** y **DeepInfra** (modelos abiertos), usados solo desde el servidor.
- **API de YouTube** para buscar videos, también solo desde el servidor.

### 6.2 Cómo viaja una acción
1. La persona abre una página. La página se arma **en el servidor** con la sesión del usuario.
2. Cada consulta a la base de datos se hace **con la identidad de ese usuario**. La base de datos decide qué filas existen para él (ver seguridad).
3. Al enviar un formulario se ejecuta una **acción de servidor**: valida los datos, verifica el rol, escribe en la base y actualiza la pantalla.
4. Los archivos se suben a carpetas privadas y se descargan con enlaces temporales que el servidor entrega solo a quien tiene permiso.

### 6.3 Organización del código
| Carpeta | Contenido |
|---|---|
| `app/(panel)/<rol>/…` | Las pantallas de cada rol. |
| `app/api/` | Puntos de servicio: `aria` (chat), `aria/voz`, `archivo` (descargas), `avatar`, `youtube/buscar`. |
| `app/login`, `app/invitacion`, `app/recuperar`, `app/restablecer` | Acceso y cuentas. |
| `lib/actions/` | Acciones de servidor por área: `admin`, `teaching`, `review`, `wellbeing`, `support`, `reports`, `community`, `enrollment`, `profile`, etc. |
| `lib/data/` | Lectura y resumen de datos: `academic`, `performance`, `student`, `guardian`, `people`, `teaching`. |
| `lib/aria/` | Todo ARIA: modos, contexto, proveedores, resguardos, conocimiento de bienestar y generación de repasos. |
| `lib/auth/` y `lib/supabase/` | Sesión, roles y clientes de base de datos. |
| `components/` | Piezas de interfaz por área (`ui`, `shell`, `teaching`, `review`, `wellbeing`, `student`, `shared`…). |
| `supabase/migrations/` | Historia completa de la base de datos, de `0001` a `0033`. |
| `supabase/seed*.sql` | Datos ficticios del colegio de demostración. |
| `tests/` | Pruebas automáticas. |

### 6.4 Modelo de datos (tablas principales)
- **Colegio y personas**: `institutions`, `institution_settings`, `institution_memberships` (rol de cada persona en cada colegio), `profiles`, `person_records` (ficha reservada), `invitations`, `guardian_student_links`, `deletion_requests`, `alumni`.
- **Estructura académica**: `academic_periods`, `grade_levels`, `courses`, `subjects`, `course_subjects` (plan de cada curso), `teacher_assignments` (quién enseña qué), `course_enrollments` (matrícula).
- **Trabajo escolar**: `assignments` (tareas y evaluaciones), `assignment_submissions`, `grades`, `attendance_records`, `student_incidents`.
- **Repaso**: `review_missions`, `review_items`, `review_item_keys` (respuestas correctas, ocultas al estudiante), `review_progress`.
- **Comunicación**: `conversations`, `conversation_participants`, `messages`, `announcements`, `announcement_comments`, `announcement_reactions`.
- **Reclamos**: `reports`, `report_notes`.
- **Bienestar**: `wellbeing_requests`, `wellbeing_request_notes`, `wellbeing_cases`, `wellbeing_interventions`, `wellbeing_case_analyses`, `assessment_templates`, `assessment_requests`, `assessment_responses`.
- **Docencia**: `teacher_feedback` (evaluación de clases), `teacher_feedback_insights`, `improvement_strategies`.
- **IA y control**: `ai_interactions`, `ai_usage`, `audit_logs`.

Todas las tablas llevan el colegio al que pertenecen (`institution_id`).

### 6.5 Archivos
Cuatro espacios privados: `materials` (adjuntos de tareas e imágenes de comunicados), `submissions` (entregas de estudiantes), `evidence` (evidencia de reclamos, la ve solo dirección y quien la subió) y `avatars` (fotos de perfil).

---

## 7. Seguridad y privacidad

Estas reglas son parte del diseño y no se deben relajar.

1. **Aislamiento entre colegios.** Ningún colegio puede leer ni escribir datos de otro. Hay pruebas automáticas que lo comprueban con un segundo colegio de demostración.
2. **Los permisos viven en la base de datos**, no solo en las pantallas. Aunque alguien manipule el navegador, la base no entrega filas que su rol no puede ver. Esto se llama seguridad a nivel de fila (RLS).
3. **Las claves solo existen en el servidor.** Ninguna clave privada lleva prefijo público ni llega al navegador. No hay secretos en el repositorio.
4. **No se guardan contraseñas en texto plano** ni se envían contraseñas temporales. Las cuentas se activan con un enlace de invitación de un solo uso.
5. **Bienestar es confidencial.** Secretaría, Dirección y docentes no ven solicitudes ni casos. Cada acceso al contenido de una solicitud queda auditado.
6. **IA con resguardo.** No se envía a los proveedores de IA información sensible identificable; el docente y la dirección trabajan con datos agregados.
7. **Sin diagnósticos.** La plataforma no diagnostica ni etiqueta a estudiantes, familias o docentes.
8. **Las métricas de docentes son para mejorar**, no un mecanismo automático de sanción.
9. **No se destruye el historial académico.** Retirar o eliminar a una persona conserva notas, entregas y asistencia; la eliminación de una cuenta es una **anonimización** (se borran sus datos personales y su acceso).
10. **Datos sintéticos.** En el MVP los flujos sensibles se muestran solo con datos ficticios.

---

## 8. El colegio de demostración

Se llama **Colegio Futuro Andino** (Santiago). Todo es ficticio.

- 12 niveles, de 1.º básico a 4.º medio, con 4 secciones de 20 estudiantes: **48 cursos y 960 estudiantes**.
- Un apoderado por estudiante y **61 docentes**, con profesor jefe por curso.
- **15 asignaturas** del currículum chileno vigente, según el nivel.
- Año escolar 2026: primer semestre cerrado y segundo en curso, con unas 3.200 tareas y evaluaciones, cerca de 49.000 notas y asistencia diaria desde marzo.
- Pre-kínder y Kínder existen como grados pero no tienen secciones.

Solo unas pocas cuentas pueden iniciar sesión (una por rol, más algunos estudiantes y apoderados); el resto puebla el colegio. En el entorno de demostración, la pantalla de acceso tiene un botón por rol para entrar sin escribir credenciales.

Existe un segundo colegio, **Colegio Demo Aislamiento**, que solo sirve para probar que los colegios no se ven entre sí.

---

## 9. Diseño

- Debe sentirse como VANTY ABA: animaciones, brillos de luz, tipografía Poppins en negrita y gráficos.
- El contenido ocupa todo el ancho; no se dejan huecos ni márgenes vacíos, y las tarjetas de una fila terminan a la misma altura.
- Pantallas simples e intuitivas, con tarjetas grandes de portada en color por asignatura.
- Las listas largas se paginan.
- Funciona en teléfono: el menú lateral se convierte en un panel deslizable y las ventanas emergentes en hojas inferiores.

---

## 10. Límites conocidos de esta versión

- No se envían correos: las invitaciones se entregan copiando un enlace.
- No hay rol «programador» ni panel técnico.
- Los videos que ARIA agrega a un repaso se eligen con filtro estricto de YouTube, pero nadie los revisa antes; el docente puede revisarlos después.
- Las preguntas que genera ARIA pueden tener errores; por eso llevan un aviso y el docente puede eliminar el repaso.
- La búsqueda de YouTube tiene un cupo gratuito de unas 100 búsquedas diarias.
- Los paneles de Dirección muestran la asistencia de las últimas cinco semanas; el estudiante y el apoderado ven el año completo.
- Parvularia no tiene cursos ni un modelo de evaluación propio.

---

## 11. Glosario

| Término | Significado |
|---|---|
| Apoderado | Adulto responsable de un estudiante ante el colegio. |
| Pupilo | El estudiante a cargo de un apoderado. |
| Curso o sección | Un grupo concreto, por ejemplo «7.º básico A». |
| Grado o nivel | El año de estudio, por ejemplo «7.º básico». |
| Profesor jefe | Docente a cargo de un curso. |
| Nota | Calificación de 1,0 a 7,0; se aprueba con 4,0. |
| Evaluación | Prueba, examen, control o exposición que se rinde en clases. |
| Misión o repaso | Actividad de práctica con videos y preguntas; no lleva nota. |
| Caso | Acompañamiento que lleva el equipo de bienestar. |
| RLS | Reglas en la base de datos que deciden qué filas ve cada usuario. |
| ARIA | La asistente de inteligencia artificial de la plataforma. |
