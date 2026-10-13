# Arquitectura de VANTY School 0.1

## 1. Qué se tomó de VANTY ABA

Se inspeccionó el proyecto VANTY ABA (Next.js 16, React 19, Tailwind 4, Supabase, Groq/DeepInfra) sin modificarlo.

| Elemento de VANTY ABA | Decisión | Dónde quedó |
|---|---|---|
| Tokens `--v-*` (`app/vanty-theme.css`): gradiente `#01abfc → #0063d8`, acento `#0069db`, fondo `#f3f8fe`, textos, bordes, estados, radios y sombras | Se copian los valores exactos | `app/theme.css` |
| Sistema de dos tipografías: Plus Jakarta Sans (cuerpo) y Poppins (títulos, cifras y negritas) | Se reutiliza tal cual | `app/fonts/`, `app/globals.css` |
| Dashboard: portada con saludo y reloj, KPI con cifra animada y halo, barras y anillos animados, entradas con resorte (`motion`) | Se replica el lenguaje con componentes propios | `components/ui/motion.tsx` |
| `AuthShell` y login (panel de marca, orbes, brillo, pestañas en píldora, campos con icono) | Se replica la estructura | `components/auth/` |
| Sidebar con píldora activa en gradiente que se desliza, entrada escalonada y barra superior translúcida | Se reimplementa el patrón (el original es un componente de 900 líneas acoplado a ABA) | `components/shell/shell.tsx` |
| Mascota de ARIA (avatar y 9 poses) y saludo al entrar | Se copian los recursos; el saludo se rehace con textos escolares | `public/aria/`, `components/aria/` |
| `lib/proveedores-ia.ts` y `lib/groq-client.ts` (Groq principal, DeepInfra respaldo, cadena de modelos) | Se porta la arquitectura y se agregan tiempo de espera, errores tipados, cupo y registro | `lib/aria/` |
| Cliente service-role `server-only`, invitaciones con token y consumo atómico, auditoría, filtros seguros | Se reutilizan los patrones | `lib/supabase/admin.ts`, `lib/actions/invitations.ts`, `lib/audit.ts` |
| Tablas, evaluaciones clínicas (CARS, Vineland, Conners…), pagos, agenda, base de conocimiento | **No se reutilizan**: modelo clínico, licencias y población distintas | — |

## 2. Decisiones técnicas

- **Server Components + Server Actions.** Las páginas leen datos en el servidor; las mutaciones son acciones en `lib/actions/`. No hay API REST propia, salvo `/api/aria` y `/api/archivo`.
- **El cliente de base de datos por defecto lleva la sesión del usuario.** Toda lectura y casi toda escritura pasan por RLS. La clave `service_role` se usa en dos lugares: aceptar una invitación (crear la cuenta) y anonimizar.
- **El rol vive en la pertenencia, no en el perfil.** `institution_memberships(institution_id, user_id, role, status)` permite que una persona pertenezca a más de un colegio con roles distintos.
- **Filtros y pestañas en la URL.** Búsquedas, filtros y paginación son parámetros (`?q=`, `?rol=`, `?p=`): sobreviven a recargar.
- **Sin estado global en el cliente.** Tras cada acción se llama a `router.refresh()` y el servidor vuelve a entregar los datos.
- **Escala de notas chilena** (1,0 a 7,0, aprobación 4,0) validada en la base de datos y en las acciones.

## 3. Multi-tenant y seguridad

Cuatro capas, de afuera hacia adentro:

1. **`proxy.ts`** renueva la sesión y corta toda petición sin autenticar a paneles y `/api`.
2. **Layouts y páginas** llaman a `requireSession(rol)`: un perfil que abre el panel de otro es redirigido antes de leer datos.
3. **Server Actions** llaman a `actionContext(rol)` y validan la entrada con zod.
4. **RLS en PostgreSQL** es la autoridad final. Ninguna de las capas anteriores es necesaria para que los datos estén protegidos.

### Reglas de RLS

- Todas las tablas operativas tienen `institution_id` y RLS activo. El rol `anon` no tiene privilegios sobre ninguna tabla.
- Toda política parte de `app.is_member(institution_id)`, que exige una pertenencia **activa** en una institución **activa**. Desactivar una cuenta corta el acceso de inmediato, incluso a sus propios registros.
- Las funciones auxiliares (`app.has_role`, `app.teaches`, `app.is_guardian_of`, `app.is_enrolled`…) son `SECURITY DEFINER`, fijan `search_path` y viven en el esquema `app`, que la API no expone.
- **Integridad entre colegios** (`0006`): disparadores verifican que cada referencia (curso, asignatura, tarea, caso, persona) pertenezca a la misma institución de la fila. Sin esto, un administrador podría apuntar una asignación docente a un curso ajeno y abrirse acceso a otro colegio.
- **Columnas restringidas**: los clientes solo pueden actualizar `full_name`, `phone` y `birth_date` del perfil, y `last_read_at` de su participación en una conversación.
- **Auditoría inmutable**: `audit_logs` admite inserción y lectura (administración), no modificación ni borrado.

### Bienestar como compartimento

- `wellbeing_cases`, `wellbeing_interventions`, `assessment_templates` y `assessment_responses` solo tienen políticas para el rol `bienestar`. Administración y dirección no pueden leerlas, ni siquiera por API.
- `wellbeing_requests`: la lee el equipo de bienestar y quien la envió (solo la propia).
- La prioridad de una solicitud no se puede fijar al crearla; la escribe una persona del equipo y queda registrado quién.
- Abrir una solicitud o un caso deja un registro en la auditoría (quién y cuándo, sin contenido).
- El equipo de bienestar ve notas y asistencia únicamente de estudiantes con solicitud o caso.

### Cuentas

- No hay registro público. Una cuenta nace al aceptar una invitación: token de 256 bits, se guarda solo su hash SHA-256, vence (7 días por defecto), es de un solo uso y se consume de forma atómica.
- Estados de una pertenencia: **activa**, **desactivada** (reversible) y **retirada** (deja el colegio). Ninguna borra registros.
- **Solicitud de eliminación → anonimización**: se borran nombre, correo, teléfono y acceso; notas, entregas y asistencia quedan ligadas a un perfil sin identidad. Las claves foráneas a personas usan `ON DELETE RESTRICT`: no existe borrado en cascada de historial académico.
- Un administrador no puede cambiar su propio rol ni desactivarse (disparador en la base de datos).

### Archivos

Dos buckets privados con límite de 10 MB y tipos permitidos:

- `materials/{institución}/…` — material, documentos y adjuntos de tareas.
- `submissions/{institución}/{tarea}/{estudiante}/…` — entregas; solo las lee el estudiante, sus apoderados y el docente de esa tarea.

Las descargas pasan por `/api/archivo`, que genera un enlace firmado de 60 segundos con la sesión del usuario.

Un tercer bucket privado, `avatars/{usuario}/…` (2 MB, solo imágenes), guarda las fotos de perfil. Cada persona escribe únicamente en su carpeta y un trigger impide que `profiles.avatar_path` apunte fuera de ella o que lo fije otra persona. `/api/avatar/{id}` entrega la foto con un enlace firmado solo si RLS permite ver ese perfil; en cualquier otro caso responde un píxel transparente y la interfaz muestra las iniciales.

## 4. ARIA

```
navegador ──POST /api/aria──▶ 1. sesión y rol ──▶ 2. contexto autorizado ──▶ 3. cupo diario
                                                                                  │
            respuesta ◀── 6. validación y registro ◀── 5. Groq → DeepInfra ◀── 4. saneo
```

| Modo | Perfil | Contexto que recibe el modelo |
|---|---|---|
| ARIA Pedagógica | Docente | Resultados **agregados** de un curso y asignatura a su cargo. Sin nombres |
| ARIA Bienestar | Bienestar | Un caso con identidad reemplazada por `[estudiante]` y sin datos de contacto |
| ARIA Familias | Apoderado | Notas, tareas pendientes y asistencia de un pupilo vinculado. Sin datos de bienestar |
| ARIA Gestión | Directivo | Indicadores agregados por curso y asignatura, y evaluación de clases agregada (grupos con 3 o más respuestas) |

- **El servidor decide el contexto.** El usuario solo envía texto y un identificador de alcance; el servidor comprueba la relación (¿imparte ese curso?, ¿es su pupilo?, ¿es un caso de su colegio?) y lee los datos con el cliente RLS. Lo que la persona no puede ver no llega al modelo, pida lo que pida.
- **Minimización**: a los proveedores salen agregados o texto seudonimizado (`lib/aria/guard.ts`: nombres, correos, RUT y teléfonos).
- **Prompt injection**: contexto y consulta van delimitados y declarados como datos; se eliminan etiquetas que imiten los delimitadores; los intentos evidentes se marcan y quedan registrados.
- **Restricciones en las instrucciones de cada modo**: no diagnostica, no etiqueta, no evalúa docentes, no decide; ante riesgo remite al protocolo humano del colegio.
- **Resiliencia**: tiempo de espera de 25 s; ante 429, 413, 404, 5xx o timeout pasa al siguiente modelo y luego al siguiente proveedor; errores tipados con mensajes claros para el usuario.
- **Costos**: cupo diario por persona definido por cada colegio (`ai_register_usage`), devolución del cupo si el proveedor falla, tope de tokens de salida y registro de tokens por usuario y día.
- **Trazabilidad**: `ai_interactions` guarda consulta, respuesta, proveedor, modelo, tokens, latencia y qué alcance se entregó. Cada persona ve solo las suyas; la administración ve volúmenes, no contenidos.
- **Sin simulación**: si no hay claves configuradas, la API responde 503 con un mensaje explícito.

## 5. Modelo de datos

**Núcleo:** `institutions`, `institution_settings`, `profiles`, `institution_memberships`, `invitations`, `audit_logs`, `deletion_requests`

**Académico:** `academic_periods`, `grade_levels`, `courses`, `subjects`, `course_enrollments`, `teacher_assignments`, `guardian_student_links`, `assignments`, `assignment_submissions`, `grades`, `attendance_records`

**Comunicación y recursos:** `announcements`, `conversations`, `conversation_participants`, `messages`, `resources`, `improvement_strategies`

**Bienestar:** `wellbeing_requests`, `wellbeing_cases`, `wellbeing_interventions`, `assessment_templates`, `assessment_responses`

**IA:** `ai_interactions`, `ai_usage`

Todas con claves primarias UUID (salvo `audit_logs`, secuencial), claves foráneas, restricciones `CHECK`, índices por institución y marcas `created_at`/`updated_at`.

## 6. Evaluaciones de bienestar

La plataforma entrega la infraestructura, no los instrumentos. Un instrumento lo define el equipo del colegio, exige una nota de autorización o licencia, y su regla de cálculo es solo aritmética (suma o promedio) y debe estar documentada. No hay puntos de corte, categorías ni interpretación automática: cada aplicación queda "por revisar" hasta que una persona profesional registra su revisión.

## 7. Datos sensibles y proveedores de IA

En este MVP los flujos sensibles usan únicamente datos sintéticos. Antes de operar con datos reales corresponde: evaluación de impacto en protección de datos, contratos de tratamiento con los proveedores de IA, consentimientos de apoderados y definición de plazos de conservación.
