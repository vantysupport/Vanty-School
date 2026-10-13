# Manual de roles y permisos

VANTY School tiene seis perfiles. El rol se asigna por colegio: una misma persona puede ser docente en un establecimiento y apoderada en otro.

Los permisos de esta tabla están implementados como políticas RLS en la base de datos (`supabase/migrations/0004_rls.sql` y siguientes) y cubiertos por `tests/permissions.test.ts`. Ocultar un botón nunca es la única protección.

## Resumen

| Información | Admin | Directivo | Docente | Bienestar | Apoderado | Estudiante |
|---|---|---|---|---|---|---|
| Usuarios del colegio | Gestiona | Lee | Sus estudiantes y apoderados | Lee | Docentes y sus pupilos | Docentes y sus apoderados |
| Estructura académica | Gestiona | Gestiona (grados, cursos, asignaturas, docentes) | Lee | Lee | Lee | Lee |
| Matrículas | Gestiona | Lee | Sus cursos | Lee | Sus pupilos | La propia |
| Tareas | Lee | Lee | Gestiona las suyas | — | De sus pupilos | De su curso |
| Entregas | Lee | Lee | De sus tareas | — | De sus pupilos | Las propias |
| Notas | Lee | Lee | Gestiona en sus asignaturas | Solo estudiantes con caso | De sus pupilos | Las propias |
| Asistencia | Lee | Lee | Gestiona en sus cursos | Solo estudiantes con caso | De sus pupilos | La propia |
| Comunicados | Publica | Publica | Publica en sus cursos | Lee | Lee | Lee |
| Mensajes | — | — | Con apoderados de sus estudiantes | Con apoderados | Con docentes de sus pupilos y bienestar | — |
| Solicitudes de bienestar | **No** | **No** | Crea derivaciones; ve las propias | Gestiona | Crea; ve las propias | Crea; ve las propias |
| Casos, intervenciones, evaluaciones | **No** | **No** | **No** | Gestiona | **No** | **No** |
| Reclamos y denuncias | **No** | Gestiona | Presenta; ve los propios | Presenta; ve los propios | Presenta; ve los propios | Presenta; ve los propios |
| Foto de perfil (la propia la cambia cada persona) | Ve las del colegio | Ve las del colegio | De sus estudiantes y apoderados | Ve las del colegio | De docentes y sus pupilos | De docentes y sus apoderados |
| Auditoría | Lee | — | — | — | — | — |
| ARIA | — | Gestión | Pedagógica | Bienestar | Familias | — |

## Administrador institucional — `/admin`

Autoridad administrativa del colegio.

- **Usuarios**: invitar, editar datos básicos, cambiar rol, desactivar, reactivar, revocar sesiones, retirar del colegio, vincular apoderados con estudiantes, solicitar y resolver eliminaciones (anonimización).
- **Gestión académica**: periodos, grados, cursos, asignaturas y asignación de docentes.
- **Matrículas**: matricular, cambiar de curso y retirar.
- **Recursos y comunicados** institucionales.
- **Auditoría**: registro de acciones administrativas y de accesos a información sensible.
- **Configuración**: datos del establecimiento, cupo diario de ARIA, vigencia de invitaciones y protocolo ante urgencias.

**Límites:** no accede a solicitudes, casos, intervenciones ni evaluaciones de bienestar. Ve que hubo accesos (auditoría) y cuánto se usa ARIA, pero no el contenido. No puede cambiar su propio rol ni desactivarse.

## Directivo — `/direccion`
Conduce el colegio: ve lo que ocurre y organiza a los equipos.

- **Inicio**: indicadores, foco de atención y actividad de los últimos 7 días (tareas publicadas, notas registradas, inasistencias, reclamos abiertos).
- **Cursos y estudiantes**: indicadores por curso, lista de estudiantes con promedio, asistencia y entregas, y la ficha académica de cada estudiante. Crea grados, cursos y asignaturas.
- **Docentes**: suma docentes por invitación, asigna o quita asignaturas por curso y revisa la carga de cada docente.
- **Rendimiento**: mapa curso × asignatura, distribución de notas, resultados por contenido y detalle con tendencia.
- **Reclamos y denuncias**: bandeja de los casos que presenta la comunidad; define gravedad, registra gestiones, responde a quien reportó y resuelve.
- **Comunicados** y **ARIA Gestión**.

**Límites:** no modifica notas ni asistencia, no cambia roles ni matrículas y solo puede invitar docentes. No accede a bienestar. Cada consulta de una ficha individual de estudiante y cada apertura de un reclamo queda en la auditoría. Los indicadores por docente describen carga y resultados de sus cursos; no son una evaluación de desempeño.

### Reclamos y denuncias

Estudiantes, apoderados, docentes y profesionales de bienestar pueden presentar reclamos, denuncias y sugerencias desde su panel. Los recibe **solo el equipo directivo**: la administración no los ve (un reclamo puede referirse a ella). Quien reporta ve únicamente sus propios casos, su estado, la resolución y las respuestas que dirección marque como visibles; no ve las notas internas ni puede fijar la gravedad.

## Docente — `/docente`

- Sus cursos: lista de estudiantes, notas por tarea y asistencia.
- Tareas: crear (con adjunto), publicar, cerrar, revisar entregas, calificar de 1,0 a 7,0 y retroalimentar.
- Asistencia diaria de sus cursos.
- Material y comunicados para sus cursos.
- Mensajes con los apoderados de sus estudiantes.
- Derivar a un estudiante al equipo de bienestar (observación pedagógica).
- ARIA Pedagógica sobre un curso y asignatura a su cargo.

**Límites:** solo escribe en los cursos y asignaturas que tiene asignados. No ve las notas de asignaturas de otros docentes. Tras derivar a bienestar no accede al caso (en esta versión tampoco tiene una pantalla para seguir el estado de sus derivaciones).

## Bienestar escolar — `/bienestar`

- Solicitudes: revisar, definir prioridad, asignarse como responsable, abrir caso.
- Casos: resumen, antecedentes académicos autorizados, intervenciones, seguimiento, derivación y cierre.
- Evaluaciones: crear instrumentos autorizados, aplicarlos y registrar la revisión profesional.
- Mensajes con apoderados.
- ARIA Bienestar, opcionalmente sobre un caso (que recibe seudonimizado).

**Límites:** ARIA no diagnostica ni fija prioridades. Los registros de bienestar no se eliminan. Cada apertura de solicitud o caso queda en la auditoría.

## Apoderado — `/apoderado`

- Resumen de cada pupilo vinculado: notas, tareas, asistencia.
- Comunicados del colegio y de los cursos de sus pupilos.
- Mensajes y solicitudes de reunión a los docentes de sus pupilos y al equipo de bienestar.
- Solicitar acompañamiento para un pupilo.
- ARIA Familias sobre un pupilo vinculado.

**Límites:** ve únicamente a los estudiantes que la administración vinculó a su cuenta. No ve notas del equipo de bienestar: solo el estado de las solicitudes que envió.

## Estudiante — `/estudiante`

- Tareas de su curso, con instrucciones y adjuntos; entregar y modificar la entrega hasta que sea calificada.
- Notas con retroalimentación, asistencia, material y comunicados.
- Pedir apoyo al equipo de bienestar de forma confidencial.

**Límites:** no tiene acceso a ARIA ni a mensajería en esta versión (decisión de resguardo para menores de edad). Sus cuentas se marcan como *gestionadas*: las crea el colegio y, para menores, se activan junto al apoderado.

## Mi perfil — `/perfil`

Disponible para los seis perfiles desde el pie del menú lateral. Cada persona, incluidos los estudiantes, puede subir su foto (JPG, PNG o WebP, hasta 2 MB) y editar su teléfono; el nombre y el correo los administra el colegio.

- **Quién la cambia:** solo la propia persona. Ni la administración ni dirección pueden fijar o reemplazar la foto de otro usuario; la base de datos lo rechaza.
- **Quién la ve:** exactamente quien ya puede ver el perfil de esa persona (la fila «Usuarios del colegio» del resumen). No es pública y nunca se muestra a otro colegio.
- **Sin foto:** se muestran las iniciales, igual que antes.

## Ciclo de vida de una cuenta

| Acción | Efecto | Reversible | Conserva historial académico |
|---|---|---|---|
| Desactivar | Pierde el acceso y se cierran sus sesiones | Sí | Sí |
| Revocar sesiones | Debe volver a iniciar sesión | — | Sí |
| Retirar del colegio | Deja de pertenecer al establecimiento | Sí, por administración | Sí |
| Solicitar eliminación | Queda pendiente de revisión | — | Sí |
| Anonimizar | Se borran datos personales y acceso | **No** | Sí, sin identidad |
| Eliminación definitiva | No automatizada: depende de la política de conservación y obligaciones legales | — | — |
