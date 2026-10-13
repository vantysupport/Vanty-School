# VANTY School 0.1

Plataforma SaaS de inteligencia educativa para colegios de Chile. Conecta a administración, dirección, docentes, estudiantes, apoderados y equipos de bienestar escolar, con **ARIA** como asistente de IA.

MVP desarrollado para Jump Chile 2026. Forma parte del ecosistema VANTY y comparte su lenguaje visual con VANTY ABA.

> **Estado:** MVP funcional con datos ficticios. Antes de usarlo con estudiantes reales requiere validación legal (Ley 19.628 y Ley 21.719 de protección de datos, normativa de convivencia escolar) y validación profesional del módulo de bienestar.

---

## Qué funciona hoy

| Flujo | Pasos verificados de punta a punta |
|---|---|
| **A · Administración** | Crear curso y asignatura · invitar usuario con enlace seguro · matricular · vincular apoderado · desactivar, reactivar, revocar sesiones · auditoría |
| **B · Aprendizaje** | El docente crea una tarea → el estudiante la ve y entrega → el docente califica con retroalimentación → la nota queda guardada → el apoderado la consulta |
| **C · Bienestar** | El estudiante pide apoyo → el equipo de bienestar revisa y fija prioridad → abre un caso → registra una intervención → programa seguimiento |
| **D · Dirección** | Indicadores agregados → foco de atención detectado → análisis por grado, sección y asignatura con apoyo de ARIA Gestión |

Todo persiste en Supabase y sobrevive a recargar la página.

**Dos pasos dependen de claves que aún faltan** (ver [Configuración pendiente](#configuración-pendiente)):

- Que ARIA responda (flujos B.7, C.4 y D.4) requiere `GROQ_API_KEY` o `DEEPINFRA_API_KEY`. Sin ellas, ARIA informa que no está configurada; no simula respuestas.
- Que un invitado cree su cuenta (flujo A.7) requiere `SUPABASE_SERVICE_ROLE_KEY`.

## Stack

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`) · **React 19** · **TypeScript**
- **Tailwind CSS 4** con tokens de diseño propios · iconos **Lucide** · animaciones con **motion**
- **Supabase**: PostgreSQL, Auth, Storage y Row Level Security
- **ARIA**: Groq (principal) y DeepInfra (respaldo), ambos por API compatible con OpenAI
- **Vitest** para las pruebas de permisos

No se usa shadcn/ui: VANTY ABA tampoco lo usa y sus componentes siguen un sistema de tokens propio (`--v-*`), que aquí se mantiene para conservar la coherencia visual.

## Instalación

Requisitos: Node.js 20 o superior y un proyecto de Supabase.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Completa `.env.local` (ver [Variables de entorno](#variables-de-entorno)) y levanta el servidor:

```bash
npm run dev
```

Abre <http://localhost:3000>.

### Base de datos

Aplica las migraciones de `supabase/migrations/` **en orden** (SQL Editor de Supabase o `supabase db push`):

| Archivo | Contenido |
|---|---|
| `0001_core.sql` | Instituciones, perfiles, pertenencias, invitaciones, auditoría |
| `0002_academic.sql` | Periodos, cursos, asignaturas, matrículas, tareas, notas, asistencia, comunicación |
| `0003_wellbeing_ai.sql` | Bienestar escolar y registro de uso de IA |
| `0004_rls.sql` | Funciones de autorización y políticas RLS |
| `0005_rpc_storage.sql` | Funciones invocables y políticas de Storage |
| `0006_integrity.sql` | Integridad entre instituciones (disparadores) |
| `0007_active_membership.sql` | Una cuenta desactivada no lee nada |
| `0008_direction.sql` | Atribuciones del equipo directivo y canal de reclamos y denuncias |
| `0009_course_plan.sql` | Plan de asignaturas por curso y capacidad de aula |
| `0010_teacher_feedback.sql` | Evaluación mensual de clases por estudiantes (anónima) y análisis de ARIA |
| `0011_avatars.sql` | Foto de perfil: columna `avatar_path`, bucket privado `avatars` y sus políticas |
| `0012_feedback_overview.sql` | Función `teacher_feedback_overview`: evaluación de clases agregada por docente, curso y mes para Rendimiento (solo dirección, grupos con 3 o más respuestas) |
| `0013_strategy_baseline.sql` | Columnas de alcance y punto de partida para estrategias de mejora. El apartado se retiró de la interfaz; la tabla `improvement_strategies` se conserva sin uso |
| `0014_community.sql` | Comunidad: imágenes, reacciones y comentarios en las publicaciones, con control por publicación (reacciones sí/no, roles que comentan) y moderación de comentarios |
| `0015_person_records.sql` | Ficha reservada de cada persona (RUN, domicilio, contacto de emergencia, cargo) e incidencias de la hoja de vida del estudiante, con datos ficticios para el colegio de demostración |
| `0016_year_close.sql` | Cierre de año escolar: decisión de continuidad por matrícula, función `close_school_year` (promoción, repitencia, retiro y egreso en una transacción), exalumnos por promoción y archivo de cursos y asignaciones del año cerrado |
| `0017_year_close_plan.sql` | Ajuste del cierre: una sección nueva sin referencia hereda el plan del curso de origen |
| `0018_student_messages.sql` | El docente puede escribirle a su estudiante, siempre con copia a los apoderados; el estudiante solo responde |
| `0019_assessment_kind.sql` | Tipo de actividad: tarea con entrega o evaluación en clases (prueba, examen, control, exposición) que solo lleva nota |
| `0020_assessment_weight.sql` | Porcentaje opcional de cada tarea o evaluación en el promedio de la asignatura |
| `0021_wellbeing_request_notes.sql` | Notas internas del equipo de bienestar en una solicitud y respuestas visibles para quien la envió |
| `0022_report_evidence.sql` | Pruebas adjuntas a un reclamo o denuncia, en un bucket confidencial que solo leen quien las subió y dirección |
| `0023_case_analyses.sql` | Análisis de ARIA guardados dentro de cada caso de bienestar, con historial, edición y eliminación |
| `0024_family_questionnaires.sql` | Cuestionarios para la familia: envío al apoderado, respuesta validada en la base y lectura de ARIA reservada al equipo |
| `0025_comment_replies.sql` | Responder a un comentario en Comunidad (cita al comentario original de la misma publicación) |
| `0026_display_mode.sql` | Preferencia de cada estudiante sobre cómo ver su panel (automático según curso, simple o completo) |
| `0027_review_missions.sql` | «Repasemos lo de clases»: misiones de repaso con videos y preguntas, avance por estudiante; las respuestas correctas quedan fuera del alcance del estudiante y se corrigen con la función `review_answer` |
| `0028_personal_review.sql` | «Crear con ARIA»: repasos personales que el estudiante pide por tema (nota «Recuerda» y preguntas); los ven él, su docente y la dirección |
| `0029_personal_review_video.sql` | Los repasos de ARIA pueden incluir un video de YouTube buscado por el servidor con filtro estricto |
| `0030_academic_snapshot.sql` | Indicadores académicos a escala de colegio: una función entrega notas, entregas, matrícula y asistencia reciente en una respuesta compacta, con las mismas reglas de lectura que RLS |
| `0031_rls_at_scale.sql` | Mismas reglas de lectura de notas, asistencia, entregas y matrículas, resueltas por conjunto y no fila por fila, para que no agoten el tiempo con decenas de miles de registros |
| `0032_people_rls_at_scale.sql` | Mismas reglas de lectura de membresías, perfiles y fichas personales, resueltas por conjunto (`app.visible_profiles`): listar las ~2.000 personas de un colegio pasa de segundos a milisegundos |
| `0033_guardian_sees_requests.sql` | El apoderado ve las solicitudes de apoyo que su pupilo envía por su cuenta, salvo las de «situación en casa» y las que bienestar reserve; las respuestas siguen siendo solo del estudiante |
| `0034_feedback_cycle.sql` | Evaluación de clases: promedios desde 5 respuestas y comentarios desde 10; el docente ve sus resultados agregados, la lectura de ARIA que dirección le comparta y registra sus estrategias |
| `0035_platform.sql` | Nivel de plataforma (equipo Vanty): alta de colegios con su base lista, invitación a secretaría y dirección, suspensión y reactivación. Solo devuelve cifras, nunca datos de estudiantes |
| `0036_school_branding.sql` | Identidad de cada colegio: logo (bucket público `school-logos`), color, dirección y teléfono. Los cambian la secretaría del colegio o el equipo Vanty |

### Datos de demostración

`supabase/seed.sql` crea el **Colegio Futuro Andino** (Santiago) con 1 administradora, 1 directivo, 3 docentes, 1 profesional de bienestar, 10 estudiantes y 6 apoderados; 3 cursos, 4 asignaturas, tareas, entregas, notas, asistencia, comunicados y casos de bienestar. Todos los datos son ficticios y están marcados como demostración.

Para tener un **colegio completo** se ejecutan después, en orden, `supabase/seed_full_school_1_people.sql` a `seed_full_school_5_feedback.sql`: 12 niveles (1.º básico a 4.º medio) con 4 secciones de 20 estudiantes (960), un apoderado por estudiante, 61 docentes, 15 asignaturas del currículum vigente, tareas, pruebas y exámenes del año escolar 2026 con sus notas, la asistencia diaria desde marzo y las evaluaciones de clases que hacen los estudiantes. Las cuentas que crean estos guiones no tienen contraseña: pueblan el colegio pero no pueden iniciar sesión; para entrar se usan las cuentas de `seed.sql`.

También crea un segundo colegio mínimo (*Colegio Demo Aislamiento*) que solo existe para las pruebas de separación entre instituciones.

1. Elige una contraseña de demostración y ponla en `DEMO_PASSWORD` de `.env.local`.
2. En una copia de `seed.sql`, reemplaza `__DEMO_PASSWORD__` por esa contraseña. No subas esa copia al repositorio.
3. Ejecuta el SQL una sola vez. Es idempotente: si los datos ya existen, no hace nada.

Con `NEXT_PUBLIC_DEMO_MODE=true`, el login muestra un acceso rápido por perfil. La contraseña nunca llega al navegador.

| Perfil | Cuenta de demostración |
|---|---|
| Administración | `admin@futuroandino.example` |
| Dirección | `direccion@futuroandino.example` |
| Docente (Matemática y Ciencias) | `mrojas@futuroandino.example` |
| Bienestar | `bienestar@futuroandino.example` |
| Apoderada (de dos estudiantes de 7.º básico) | `ap05@futuroandino.example` |
| Estudiante (7.º básico A) | `est06@futuroandino.example` |

## Panel de plataforma (equipo Vanty)

En `/plataforma` el equipo Vanty crea colegios y acompaña su puesta en marcha. No es un rol dentro de un colegio:
quien pertenece al equipo no ve notas, fichas, mensajes ni casos de ningún establecimiento, solo cifras.

- **Crear colegio**: deja listos la configuración, los dos semestres del año, los grados de los niveles elegidos y las
  asignaturas del currículum. Opcionalmente genera la invitación para su secretaría.
- **Ficha del colegio**: avance de la puesta en marcha paso a paso (qué hizo el equipo Vanty y qué le toca a
  secretaría), cuentas por rol, invitaciones a secretaría y dirección, edición de datos, suspender y reactivar.
- **Equipo Vanty**: integrantes e invitaciones al equipo.

La primera persona del equipo se invita desde el servidor (después, el resto se invita desde el panel):

```bash
npm run plataforma:invitar -- correo@ejemplo.cl "Nombre Apellido"
```

El comando muestra un enlace de un solo uso, válido 7 días, para que esa persona cree su contraseña. El acceso de
demostración de `/login` no incluye este panel a propósito: es público.

## Variables de entorno

| Variable | Ámbito | Uso |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública | Clave publishable/anon. No da acceso a datos por sí sola: RLS decide |
| `SUPABASE_SERVICE_ROLE_KEY` | **Privada** | Crear cuentas al aceptar invitaciones y anonimizar cuentas |
| `NEXT_PUBLIC_SITE_URL` | Pública | Base de los enlaces de invitación y recuperación |
| `GROQ_API_KEY` | **Privada** | Proveedor principal de ARIA |
| `DEEPINFRA_API_KEY` | **Privada** | Proveedor de respaldo de ARIA |
| `EDGE_TTS_VOICE` | Opcional | Voz de ARIA (por defecto `es-PE-CamilaNeural`, la misma de VANTY ABA). No requiere clave. El texto que se lee se envía al servicio de voz de Microsoft Edge, sin contrato de servicio: para producción conviene migrar a Azure Speech |
| `EDGE_TTS_VERSION` | Opcional | Versión de Edge que declara el cliente de voz; actualizar si el servicio empieza a responder 403 |
| `NEXT_PUBLIC_DEMO_MODE` | Pública | Muestra los accesos de demostración en el login |
| `DEMO_PASSWORD` | **Privada** | Contraseña de las cuentas demo |
| `GMAIL_USER` | **Privada** | Cuenta de Gmail desde la que salen los correos (invitaciones, recuperar contraseña, aviso de mensaje nuevo) |
| `GMAIL_PASS` | **Privada** | Contraseña de aplicación de esa cuenta (16 caracteres; requiere verificación en dos pasos). Sin estas dos variables no se envía ningún correo y los enlaces se muestran en pantalla |

Next.js exige el prefijo `NEXT_PUBLIC_` para lo que viaja al navegador; por eso la URL y la clave pública de Supabase lo llevan. Las claves privadas no lo llevan y solo se leen en módulos marcados `server-only`.

## Configuración pendiente

1. **`SUPABASE_SERVICE_ROLE_KEY`** — Supabase → Project Settings → API Keys → *service_role* (o *secret*). Pégala en `.env.local`.
2. **`GROQ_API_KEY`** (<https://console.groq.com/keys>) y/o **`DEEPINFRA_API_KEY`** (<https://deepinfra.com/dash/api_keys>).
3. En Supabase → Authentication:
   - Desactiva *Allow new users to sign up*: las cuentas solo nacen de invitaciones.
   - En *URL Configuration*, agrega `<tu-dominio>/auth/callback` como URL de redirección (recuperación de acceso).
   - Activa *Leaked password protection* si tu plan lo permite.
   - Activa MFA (TOTP) para el personal: ver [Pendientes](#funcionalidades-pendientes).

Reinicia `npm run dev` después de editar `.env.local`.

## Comandos

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

## Pruebas

`npm test` ejecuta 60 pruebas:

- **`tests/permissions.test.ts`** (38): inician sesión como cada perfil demo con la clave pública y comprueban las políticas RLS reales, sin usar la clave de servicio. Cubren el aislamiento entre colegios, los permisos por rol, que un apoderado solo vea a sus pupilos, la confidencialidad de bienestar frente a administración y dirección, que una cuenta desactivada no lea nada y que la foto de perfil solo la cambie su dueño y la vea quien ya puede ver ese perfil.
- **`tests/aria-guard.test.ts`** (8): saneo de entradas, detección de *prompt injection*, seudonimización y restricción de modos.

Las pruebas de permisos necesitan los datos de demostración cargados y `DEMO_PASSWORD` en `.env.local`; si falta la configuración, se omiten.

## Estructura

```
app/
  login, recuperar, restablecer, invitacion/[token]   acceso
  (panel)/admin | direccion | docente | bienestar | apoderado | estudiante
  api/aria        endpoint único de ARIA
  api/archivo     descarga de archivos con enlace firmado
components/
  ui/             primitivas, diálogos, filtros, avisos, subida de archivos
  shell/          sidebar y barra superior
  aria/           chat y botón flotante de ARIA
  auth/, admin/, direction/, shared/
lib/
  auth/session.ts sesión, pertenencia activa y control de rol
  supabase/       clientes: servidor (RLS), navegador y service_role
  actions/        Server Actions por dominio
  aria/           proveedores, cliente, modos, contexto y defensas
  data/           lectura y agregación
supabase/migrations/, supabase/seed.sql
tests/
docs/
proxy.ts          renovación de sesión y bloqueo sin autenticación
```

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md): decisiones técnicas, modelo de datos, seguridad y ARIA.
- [Roles y permisos](docs/ROLES-Y-PERMISOS.md): qué puede ver y hacer cada perfil.

## Funcionalidades pendientes

**No implementado** (no hay interfaz que lo aparente):

- Correos de comunicados, tareas, notas y bienestar. Hoy se envían por correo las invitaciones, la recuperación de contraseña y el aviso de mensaje nuevo (sin el contenido del mensaje, y nunca a estudiantes).
- Alta de nuevas instituciones desde la aplicación: se crean por SQL (proceso administrativo interno).
- MFA obligatorio para personal: Supabase Auth lo soporta; falta la pantalla de enrolamiento y exigir `aal2` en el proxy.
- Horarios de clases.
- Eliminación definitiva de cuentas según plazos de conservación: existe la solicitud y la anonimización; el borrado físico requiere definir la política legal del colegio.
- Notificaciones en tiempo real (Supabase Realtime). Los mensajes y comunicados se ven al entrar o recargar.
- Respuestas en *streaming* de ARIA y memoria de conversación entre sesiones.
- Modo oscuro (los tokens están preparados; falta la variante de los logotipos).
- Calendario escolar y formulario de evaluación respondido directamente por el estudiante.

**Limitaciones conocidas:**

- El listado de usuarios filtra y pagina en memoria: adecuado para un colegio, no para miles de cuentas.
- Un usuario con cuenta en otro colegio no puede aceptar una invitación con el mismo correo (falta el flujo de "unirse con cuenta existente"). El modelo de datos sí admite pertenencias múltiples.
- Los archivos de material se pueden leer por cualquier miembro del colegio que conozca la ruta exacta; la ruta solo se entrega a quien puede ver el recurso. Las entregas de estudiantes sí están restringidas por persona.
- No se probó visualmente en dispositivos físicos: se verificó que a 375 px no hay desborde horizontal y que el menú lateral se convierte en panel deslizable.

## Créditos

Arquitectura de ARIA, tokens de color, tipografías Plus Jakarta Sans y Poppins, lenguaje de animación del dashboard y mascota de ARIA provienen de VANTY ABA. El modelo de datos, las políticas de acceso y todas las pantallas son propias de VANTY School.
