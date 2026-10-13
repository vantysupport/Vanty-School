import { describe, expect, it } from 'vitest'
import { anonClient, as, configured, count, institutionId } from './helpers'

// Pruebas de autorización contra la base de datos real con los datos de demostración.
// Requieren .env.local con NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y DEMO_PASSWORD.

const all = { count: 'exact' as const, head: true }

describe.skipIf(!configured)('aislamiento entre colegios', () => {
  it('un visitante sin sesión no lee ninguna tabla', async () => {
    const db = anonClient()
    for (const table of ['institutions', 'profiles', 'grades', 'wellbeing_requests', 'institution_memberships']) {
      const { data, error } = await db.from(table).select('*').limit(1)
      expect(error ?? data, table).toSatisfy((v: unknown) => (Array.isArray(v) ? v.length === 0 : true))
    }
  })

  it('cada administrador ve solo su propia institución', async () => {
    const [{ db: a }, { db: b }] = await Promise.all([as('admin'), as('otroAdmin')])
    const [instA, instB] = await Promise.all([a.from('institutions').select('name'), b.from('institutions').select('name')])
    expect(instA.data?.map(i => i.name)).toEqual(['Colegio Futuro Andino'])
    expect(instB.data?.map(i => i.name)).toEqual(['Colegio Demo Aislamiento'])
  })

  it('el administrador de un colegio no ve usuarios, cursos, notas ni solicitudes del otro', async () => {
    const { db } = await as('admin')
    const other = await institutionId('otroAdmin')
    for (const table of ['institution_memberships', 'courses', 'subjects', 'grades', 'assignments', 'course_enrollments', 'wellbeing_requests', 'audit_logs']) {
      expect(await count(db.from(table).select('*', all).eq('institution_id', other)), table).toBe(0)
    }
    const { data: profile } = await db.from('profiles').select('id').eq('email', 'estudiante@aislamiento.example')
    expect(profile).toEqual([])
  })

  it('el administrador no puede crear ni modificar datos en otro colegio', async () => {
    const { db } = await as('admin')
    const other = await institutionId('otroAdmin')
    const insert = await db.from('subjects').insert({ institution_id: other, name: 'Intrusión' }).select()
    expect(insert.error).not.toBeNull()
    const update = await db.from('institutions').update({ name: 'Renombrado' }).eq('id', other).select()
    expect(update.data ?? []).toEqual([])
  })

  it('una fila propia no puede apuntar a un curso de otro colegio', async () => {
    const [{ db, id: adminId }, { db: otherDb }] = await Promise.all([as('admin'), as('otroAdmin')])
    const mine = await institutionId('admin')
    const { data: foreign } = await otherDb.from('courses').select('id').limit(1).single()
    const { data: subject } = await db.from('subjects').select('id').limit(1).single()
    const { data: teacher } = await db.from('institution_memberships').select('user_id').eq('role', 'docente').limit(1).single()
    // Sin esta protección, el docente del colegio A pasaría a "impartir" un curso del colegio B.
    const { error } = await db.from('teacher_assignments').insert({ institution_id: mine, course_id: foreign!.id, subject_id: subject!.id, teacher_id: teacher!.user_id })
    expect(error).not.toBeNull()
    expect(adminId).toBeTruthy()
  })

  it('un estudiante de otro colegio no ve tareas ni notas del colegio demo', async () => {
    const { db } = await as('otroEstudiante')
    const mine = await institutionId('admin')
    expect(await count(db.from('assignments').select('*', all).eq('institution_id', mine))).toBe(0)
    expect(await count(db.from('grades').select('*', all).eq('institution_id', mine))).toBe(0)
  })
})

describe.skipIf(!configured)('permisos por rol', () => {
  it('un estudiante solo ve sus propias notas y entregas', async () => {
    const { db, id } = await as('estudiante6')
    const { data: grades } = await db.from('grades').select('student_id')
    const { data: subs } = await db.from('assignment_submissions').select('student_id')
    expect(grades!.length).toBeGreaterThan(0)
    expect(new Set(grades!.map(g => g.student_id))).toEqual(new Set([id]))
    expect(new Set(subs!.map(s => s.student_id))).toEqual(new Set([id]))
  })

  it('un estudiante no puede ponerse ni cambiarse una nota', async () => {
    const { db, id } = await as('estudiante6')
    const { data: own } = await db.from('grades').select('*').limit(1).single()
    const update = await db.from('grades').update({ score: 7 }).eq('id', own!.id).select()
    expect(update.data ?? []).toEqual([])
    const insert = await db.from('grades').insert({ ...own, id: undefined, student_id: id, score: 7, graded_by: id })
    expect(insert.error).not.toBeNull()
  })

  it('un estudiante no puede cambiar su rol ni crear pertenencias', async () => {
    const { db, id } = await as('estudiante6')
    const inst = await institutionId('estudiante6')
    const update = await db.from('institution_memberships').update({ role: 'admin' }).eq('user_id', id).select()
    expect(update.data ?? []).toEqual([])
    const insert = await db.from('institution_memberships').insert({ institution_id: inst, user_id: id, role: 'admin' })
    expect(insert.error).not.toBeNull()
  })

  it('un apoderado ve únicamente a los estudiantes vinculados', async () => {
    const { db } = await as('apoderado')
    const { data: links } = await db.from('guardian_student_links').select('student_id')
    const linked = new Set(links!.map(l => l.student_id))
    expect(linked.size).toBe(2)
    const [{ data: grades }, { data: attendance }, { data: enrollments }] = await Promise.all([
      db.from('grades').select('student_id'), db.from('attendance_records').select('student_id'), db.from('course_enrollments').select('student_id'),
    ])
    for (const rows of [grades!, attendance!, enrollments!]) {
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every(r => linked.has(r.student_id))).toBe(true)
    }
    const { db: student } = await as('estudiante6')
    const { data: outsider } = await student.auth.getUser()
    const { data: profile } = await db.from('profiles').select('id').eq('id', outsider.user!.id)
    expect(profile).toEqual([])
  })

  it('un docente califica en su asignatura y no en la de otro docente', async () => {
    const { db, id } = await as('docenteMat')
    // Una nota puesta por ella a un estudiante que sigue matriculado en el curso: las de quienes ya no están no se pueden modificar.
    const [{ data: mine }, { data: enrolled }] = await Promise.all([
      db.from('grades').select('id, score, feedback, student_id, course_id').eq('graded_by', id),
      db.from('course_enrollments').select('student_id, course_id').eq('status', 'active'),
    ])
    const own = mine!.find(g => enrolled!.some(e => e.student_id === g.student_id && e.course_id === g.course_id))
    const saved = await db.from('grades').update({ feedback: `${own!.feedback} ` , graded_by: id }).eq('id', own!.id).select('id')
    expect(saved.data?.length).toBe(1)
    await db.from('grades').update({ feedback: own!.feedback, graded_by: id }).eq('id', own!.id)

    // La nota de Lenguaje existe (la ve el docente de Lenguaje) pero no para la docente de Matemática.
    const { db: len } = await as('docenteLen')
    const { data: foreign } = await len.from('grades').select('id').limit(1).single()
    const { data: hidden } = await db.from('grades').select('id').eq('id', foreign!.id)
    expect(hidden).toEqual([])
    const blocked = await db.from('grades').update({ score: 1 }).eq('id', foreign!.id).select()
    expect(blocked.data ?? []).toEqual([])
  })

  it('una cuenta desactivada deja de leer incluso sus propios registros', async () => {
    // Regresión: las cláusulas "es mi registro" no exigían pertenencia activa.
    const [{ db: admin }, { db: student, id }] = await Promise.all([as('admin'), as('estudianteAux')])
    const own = ['grades', 'attendance_records', 'course_enrollments', 'assignment_submissions', 'institutions']
    expect(await count(student.from('attendance_records').select('*', all))).toBeGreaterThan(0)
    try {
      const suspended = await admin.from('institution_memberships').update({ status: 'suspended' }).eq('user_id', id).select('id')
      expect(suspended.data?.length).toBe(1)
      for (const table of own) expect(await count(student.from(table).select('*', all)), table).toBe(0)
    } finally {
      await admin.from('institution_memberships').update({ status: 'active' }).eq('user_id', id)
    }
    expect(await count(student.from('attendance_records').select('*', all))).toBeGreaterThan(0)
  })

  it('el directivo consulta indicadores pero no modifica notas', async () => {
    const { db } = await as('directivo')
    expect(await count(db.from('grades').select('*', all))).toBeGreaterThan(0)
    const { data: one } = await db.from('grades').select('id').limit(1).single()
    const update = await db.from('grades').update({ score: 7 }).eq('id', one!.id).select()
    expect(update.data ?? []).toEqual([])
  })

  it('una conversación solo la leen sus participantes y nadie puede cambiarse a otra', async () => {
    const [{ db: guardian }, { db: teacher }, { db: other, id: otherId }] = await Promise.all([as('apoderado'), as('docenteMat'), as('docenteHis')])
    const { data: mine } = await guardian.from('conversations').select('id')
    expect(mine!.length).toBeGreaterThan(0)
    expect((await teacher.from('messages').select('id').eq('conversation_id', mine![0].id)).data!.length).toBeGreaterThan(0)
    expect((await other.from('messages').select('id').eq('conversation_id', mine![0].id)).data).toEqual([])
    const sneak = await other.from('conversation_participants').insert({ conversation_id: mine![0].id, user_id: otherId })
    expect(sneak.error).not.toBeNull()
  })

  it('un estudiante no inicia conversaciones y un docente no le escribe a un estudiante ajeno', async () => {
    const [{ db: student, id: studentId }, { db: teacher, id: teacherId }, { id: foreignId }] = await Promise.all([as('estudiante6'), as('docenteMat'), as('otroEstudiante')])
    const inst = await institutionId('admin')
    const args = { p_inst: inst, p_subject: 'Prueba', p_body: 'Hola', p_kind: 'message' }
    // Los mensajes a estudiantes los abre el docente (con copia al apoderado); el estudiante solo responde.
    const fromStudent = await student.rpc('start_conversation', { ...args, p_recipient: teacherId, p_student: studentId })
    expect(fromStudent.error).not.toBeNull()
    const toForeign = await teacher.rpc('start_conversation', { ...args, p_recipient: foreignId, p_student: foreignId })
    expect(toForeign.error).not.toBeNull()
  })
})

describe.skipIf(!configured)('confidencialidad de bienestar', () => {
  const sensitive = ['wellbeing_cases', 'wellbeing_interventions', 'assessment_templates', 'assessment_responses']

  it('el equipo de bienestar ve las solicitudes y casos de su colegio, no los de otro', async () => {
    const { db } = await as('bienestar')
    const other = await institutionId('otroAdmin')
    expect(await count(db.from('wellbeing_requests').select('*', all))).toBeGreaterThanOrEqual(3)
    expect(await count(db.from('wellbeing_cases').select('*', all))).toBeGreaterThanOrEqual(1)
    expect(await count(db.from('wellbeing_requests').select('*', all).eq('institution_id', other))).toBe(0)
  })

  it.each(['admin', 'directivo', 'docenteMat', 'apoderado', 'estudiante7'] as const)('%s no puede leer casos, intervenciones ni evaluaciones', async who => {
    const { db } = await as(who)
    for (const table of sensitive) expect(await count(db.from(table).select('*', all)), table).toBe(0)
  })

  it('administración y dirección no ven ninguna solicitud de bienestar', async () => {
    for (const who of ['admin', 'directivo'] as const) {
      const { db } = await as(who)
      expect(await count(db.from('wellbeing_requests').select('*', all)), who).toBe(0)
    }
  })

  it('quien solicita ve solo su propia solicitud', async () => {
    const { db, id } = await as('estudiante1m')
    const { data } = await db.from('wellbeing_requests').select('requested_by, student_id')
    expect(data!.length).toBeGreaterThanOrEqual(1)
    expect(data!.every(r => r.requested_by === id)).toBe(true)
    // El estudiante cuya apoderada pidió apoyo no ve esa solicitud: solo las que él mismo haya enviado.
    const { db: withCase, id: studentId } = await as('estudiante7')
    const { data: visible } = await withCase.from('wellbeing_requests').select('requested_by')
    expect(visible!.every(r => r.requested_by === studentId)).toBe(true)
  })

  it('nadie puede fijar la prioridad al crear una solicitud ni pedir apoyo a nombre de otro estudiante', async () => {
    const { db, id } = await as('estudiante1m')
    const inst = await institutionId('estudiante1m')
    const base = { institution_id: inst, requested_by: id, source: 'estudiante', category: 'otro', description: 'Prueba automática de permisos' }
    expect((await db.from('wellbeing_requests').insert({ ...base, student_id: id, priority: 'urgente' })).error).not.toBeNull()
    const { id: other } = await as('estudiante6')
    expect((await db.from('wellbeing_requests').insert({ ...base, student_id: other })).error).not.toBeNull()
  })

  it('un docente no puede modificar una solicitud ni un apoderado abrir un caso', async () => {
    const { db: teacher } = await as('docenteLen')
    const { data: own } = await teacher.from('wellbeing_requests').select('id').limit(1)
    if (own?.length) expect((await teacher.from('wellbeing_requests').update({ status: 'closed' }).eq('id', own[0].id).select()).data ?? []).toEqual([])
    const { db: guardian, id } = await as('apoderado')
    const inst = await institutionId('apoderado')
    const { data: links } = await guardian.from('guardian_student_links').select('student_id').limit(1).single()
    const attempt = await guardian.from('wellbeing_cases').insert({ institution_id: inst, student_id: links!.student_id, opened_by: id, responsible_id: id, summary: 'Intento no autorizado' })
    expect(attempt.error).not.toBeNull()
  })

  it('la auditoría es de solo lectura para la administración e invisible para el resto', async () => {
    const { db: admin } = await as('admin')
    const { data: log } = await admin.from('audit_logs').select('id').limit(1).single()
    expect((await admin.from('audit_logs').update({ action: 'alterado' }).eq('id', log!.id).select()).error).not.toBeNull()
    expect((await admin.from('audit_logs').delete().eq('id', log!.id).select()).error).not.toBeNull()
    const { db: teacher } = await as('docenteMat')
    expect(await count(teacher.from('audit_logs').select('*', all))).toBe(0)
  })
})

describe.skipIf(!configured)('reclamos y denuncias', () => {
  it('solo el equipo directivo ve la bandeja; administración, bienestar y docentes no', async () => {
    const { db: dir } = await as('directivo')
    expect(await count(dir.from('reports').select('*', all))).toBeGreaterThanOrEqual(3)
    for (const who of ['admin', 'bienestar', 'docenteMat', 'estudiante6'] as const) {
      const { db, id } = await as(who)
      const { data } = await db.from('reports').select('reporter_id')
      expect(data!.every(r => r.reporter_id === id), who).toBe(true)
    }
    const { db: admin } = await as('admin')
    expect(await count(admin.from('reports').select('*', all))).toBe(0)
    expect(await count(admin.from('report_notes').select('*', all))).toBe(0)
  })

  it('quien reporta no puede fijar gravedad ni resolver su propio caso, ni leer notas internas', async () => {
    const { db, id } = await as('estudiante6')
    const inst = await institutionId('estudiante6')
    const base = { institution_id: inst, reporter_id: id, kind: 'reclamo', category: 'otro', subject: 'Prueba automática', description: 'Caso creado por la prueba de permisos.' }
    expect((await db.from('reports').insert({ ...base, severity: 'grave' })).error).not.toBeNull()
    expect((await db.from('reports').insert({ ...base, status: 'resolved' })).error).not.toBeNull()
    expect(await count(db.from('report_notes').select('*', all))).toBe(0)
  })

  it('el equipo directivo no ve reclamos de otro colegio', async () => {
    const { db } = await as('directivo')
    const other = await institutionId('otroAdmin')
    expect(await count(db.from('reports').select('*', all).eq('institution_id', other))).toBe(0)
  })
})

describe.skipIf(!configured)('atribuciones del equipo directivo', () => {
  it('puede asignar docentes pero no cambiar roles ni matrículas', async () => {
    const { db } = await as('directivo')
    const { data: ta } = await db.from('teacher_assignments').select('id, teacher_id').limit(1).single()
    const same = await db.from('teacher_assignments').update({ teacher_id: ta!.teacher_id }).eq('id', ta!.id).select('id')
    expect(same.data?.length).toBe(1)

    const { id: student } = await as('estudiante6')
    const role = await db.from('institution_memberships').update({ role: 'admin' }).eq('user_id', student).select()
    expect(role.data ?? []).toEqual([])
    const enrollment = await db.from('course_enrollments').update({ status: 'withdrawn' }).eq('student_id', student).select()
    expect(enrollment.data ?? []).toEqual([])
  })

  it('solo puede invitar docentes', async () => {
    const { db, id } = await as('directivo')
    const inst = await institutionId('directivo')
    const base = { institution_id: inst, full_name: 'Prueba Automática', token_hash: `test-${Date.now()}`, expires_at: new Date(Date.now() + 60_000).toISOString(), created_by: id }
    expect((await db.from('invitations').insert({ ...base, email: 'admin.falso@futuroandino.example', role: 'admin' })).error).not.toBeNull()
    const ok = await db.from('invitations').insert({ ...base, email: 'docente.prueba@futuroandino.example', role: 'docente' }).select('id').single()
    expect(ok.error).toBeNull()
    // Limpieza: la invitación de prueba se revoca y el administrador la elimina.
    const { db: admin } = await as('admin')
    await admin.from('invitations').delete().eq('id', ok.data!.id)
  })

  it('sigue sin acceso a bienestar', async () => {
    const { db } = await as('directivo')
    for (const table of ['wellbeing_requests', 'wellbeing_cases', 'wellbeing_interventions']) expect(await count(db.from(table).select('*', all)), table).toBe(0)
  })
})

describe.skipIf(!configured)('evaluación mensual de clases', () => {
  it('las respuestas individuales son invisibles para dirección, administración y docentes', async () => {
    for (const who of ['directivo', 'admin', 'docenteMat', 'bienestar', 'apoderado'] as const) {
      const { db } = await as(who)
      expect(await count(db.from('teacher_feedback').select('*', all)), who).toBe(0)
    }
  })

  it('un estudiante solo ve sus propias respuestas y no puede evaluar clases de otro curso', async () => {
    const { db, id } = await as('estudiante6')
    const { data: own } = await db.from('teacher_feedback').select('student_id')
    expect(own!.length).toBeGreaterThan(0)
    expect(own!.every(r => r.student_id === id)).toBe(true)

    // est01 cursa 6.º básico: no puede evaluar una clase de 1.º medio.
    const { db: other } = await as('estudiante1m')
    const { data: foreign } = await other.from('teacher_feedback').select('institution_id, teacher_id, course_id, subject_id, period_month').limit(1).single()
    const attempt = await db.from('teacher_feedback').insert({ ...foreign, student_id: id, claridad: 1, ritmo: 1, participacion: 1, retroalimentacion: 1, organizacion: 1, trato: 1 })
    expect(attempt.error).not.toBeNull()
  })

  it('dirección obtiene el resumen agregado, con el mínimo de respuestas y sin datos que identifiquen estudiantes', async () => {
    const [{ db: dir }, { id: teacher }, inst] = await Promise.all([as('directivo'), as('docenteMat'), institutionId('directivo')])
    const { data, error } = await dir.rpc('teacher_feedback_summary', { p_inst: inst, p_teacher: teacher })
    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((m: { responses: number }) => m.responses >= 5)).toBe(true)
    // Los comentarios solo aparecen cuando el mes reúne 10 o más respuestas.
    expect(data.every((m: { responses: number; comments: string[] }) => m.responses >= 10 || m.comments.length === 0)).toBe(true)
    expect(JSON.stringify(data)).not.toMatch(/student_id/)

    for (const who of ['admin', 'estudiante6'] as const) {
      const { db } = await as(who)
      expect((await db.rpc('teacher_feedback_summary', { p_inst: inst, p_teacher: teacher })).error, who).not.toBeNull()
    }
  })

  it('el docente ve sus propios promedios sin comentarios, y no los de otro docente', async () => {
    const [{ db, id }, { id: other }, inst] = await Promise.all([as('docenteMat'), as('docenteLen'), institutionId('directivo')])
    const own = await db.rpc('teacher_feedback_summary', { p_inst: inst, p_teacher: id })
    expect(own.error).toBeNull()
    expect(own.data.every((m: { comments: string[] }) => m.comments.length === 0)).toBe(true)
    expect((await db.rpc('teacher_feedback_summary', { p_inst: inst, p_teacher: other })).error).not.toBeNull()
  })

  it('las estrategias las escribe solo su docente; dirección las lee y nadie más las ve', async () => {
    const [{ db, id }, { db: other, id: otherId }, { db: dir }, { db: student }, inst] = await Promise.all([as('docenteMat'), as('docenteLen'), as('directivo'), as('estudiante6'), institutionId('directivo')])
    const row = { institution_id: inst, teacher_id: id, period_month: '2026-01-01', focus: 'claridad', action: 'Estrategia de la prueba automática' }
    const created = await db.from('teaching_commitments').insert(row).select('id').single()
    expect(created.error).toBeNull()
    try {
      expect((await db.from('teaching_commitments').insert({ ...row, teacher_id: otherId })).error).not.toBeNull()
      expect((await other.from('teaching_commitments').select('id').eq('id', created.data!.id)).data).toEqual([])
      expect((await student.from('teaching_commitments').select('id')).data).toEqual([])
      expect((await dir.from('teaching_commitments').select('id').eq('id', created.data!.id)).data?.length).toBe(1)
      expect((await dir.from('teaching_commitments').update({ action: 'editada por dirección' }).eq('id', created.data!.id).select('id')).data ?? []).toEqual([])
    } finally {
      await db.from('teaching_commitments').delete().eq('id', created.data!.id)
    }
  })
})

describe.skipIf(!configured)('foto de perfil', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

  it('nadie puede fijar la foto de otra persona, ni siquiera la administración', async () => {
    const { db: target, id } = await as('estudiante6')
    for (const who of ['estudiante1m', 'docenteMat', 'admin', 'otroAdmin'] as const) {
      const { db } = await as(who)
      await db.from('profiles').update({ avatar_path: `${id}/ajena.png` }).eq('id', id)
      const { data } = await target.from('profiles').select('avatar_path').eq('id', id).single()
      expect(data!.avatar_path, who).toBeNull()
    }
  })

  it('la ruta guardada debe estar dentro de la carpeta propia', async () => {
    const [{ db, id }, { id: other }] = await Promise.all([as('estudiante6'), as('estudiante1m')])
    const attempt = await db.from('profiles').update({ avatar_path: `${other}/foto.png` }).eq('id', id)
    expect(attempt.error).not.toBeNull()
    const { data } = await db.from('profiles').select('avatar_path').eq('id', id).single()
    expect(data!.avatar_path).toBeNull()
  })

  it('no se puede subir un archivo a la carpeta de otra persona', async () => {
    const [{ db }, { db: owner, id: other }] = await Promise.all([as('estudiante6'), as('estudiante1m')])
    const attempt = await db.storage.from('avatars').upload(`${other}/intruso.png`, PNG, { contentType: 'image/png' })
    expect(attempt.error).not.toBeNull()
    const { data } = await owner.storage.from('avatars').list(other)
    expect((data ?? []).some(f => f.name === 'intruso.png')).toBe(false)
  })

  it('la foto propia la ve quien ya puede ver el perfil, y nadie de otro colegio', async () => {
    const { db, id } = await as('estudiante6')
    const path = `${id}/prueba-${Date.now()}.png`
    try {
      expect((await db.storage.from('avatars').upload(path, PNG, { contentType: 'image/png' })).error).toBeNull()
      expect((await db.from('profiles').update({ avatar_path: path }).eq('id', id)).error).toBeNull()

      const { db: teacher } = await as('docenteMat')
      expect((await teacher.storage.from('avatars').createSignedUrl(path, 60)).data?.signedUrl).toBeTruthy()
      for (const who of ['otroDocente', 'otroEstudiante'] as const) {
        const { db: outsider } = await as(who)
        expect((await outsider.storage.from('avatars').createSignedUrl(path, 60)).data?.signedUrl, who).toBeFalsy()
        expect((await outsider.storage.from('avatars').remove([path])).data ?? [], who).toHaveLength(0)
      }
    } finally {
      await db.from('profiles').update({ avatar_path: null }).eq('id', id)
      await db.storage.from('avatars').remove([path])
    }
    const { data } = await db.storage.from('avatars').list(id)
    expect(data ?? []).toHaveLength(0)
  })
})

describe.runIf(configured)('comunidad: reacciones, comentarios y moderación', () => {
  /** Publicación de dirección para todo el colegio: la ven apoderados y estudiantes, pero solo comentan apoderados. */
  async function withPost(run: (postId: string, inst: string) => Promise<void>) {
    const { db, id } = await as('directivo')
    const inst = await institutionId('directivo')
    const { data, error } = await db.from('announcements').insert({
      institution_id: inst, author_id: id, title: 'Publicación de prueba', body: 'Contenido de prueba.',
      audience: ['apoderado', 'estudiante'], comment_roles: ['apoderado'], allow_reactions: true,
    }).select('id').single()
    expect(error).toBeNull()
    try { await run(data!.id as string, inst) } finally { await db.from('announcements').delete().eq('id', data!.id) }
  }

  it('reacciona quien ve la publicación; comenta solo el rol habilitado', async () => {
    await withPost(async (post, inst) => {
      const [student, guardian] = await Promise.all([as('estudiante6'), as('apoderado')])
      expect((await student.db.from('announcement_reactions').insert({ announcement_id: post, user_id: student.id, institution_id: inst, kind: 'like' })).error).toBeNull()
      expect((await student.db.from('announcement_comments').insert({ announcement_id: post, author_id: student.id, institution_id: inst, body: 'No debería publicarse' })).error).not.toBeNull()
      expect((await guardian.db.from('announcement_comments').insert({ announcement_id: post, author_id: guardian.id, institution_id: inst, body: 'Gracias por el aviso' })).error).toBeNull()
      // Nadie puede reaccionar ni comentar a nombre de otra persona.
      expect((await student.db.from('announcement_reactions').insert({ announcement_id: post, user_id: guardian.id, institution_id: inst, kind: 'love' })).error).not.toBeNull()
      const { data } = await student.db.from('announcement_comments').select('author_name, author_role').eq('announcement_id', post)
      expect(data).toHaveLength(1)
      expect(data![0].author_role).toBe('apoderado')
      expect(data![0].author_name.length).toBeGreaterThan(0)
    })
  })

  it('con las reacciones desactivadas nadie puede reaccionar', async () => {
    await withPost(async (post, inst) => {
      const { db } = await as('directivo')
      expect((await db.from('announcements').update({ allow_reactions: false }).eq('id', post)).error).toBeNull()
      const guardian = await as('apoderado')
      expect((await guardian.db.from('announcement_reactions').insert({ announcement_id: post, user_id: guardian.id, institution_id: inst, kind: 'like' })).error).not.toBeNull()
    })
  })

  it('un comentario oculto deja de verse, salvo para quien lo escribió y quien modera', async () => {
    await withPost(async (post, inst) => {
      const [director, student, guardian] = await Promise.all([as('directivo'), as('estudiante6'), as('apoderado')])
      const { data: comment } = await guardian.db.from('announcement_comments').insert({ announcement_id: post, author_id: guardian.id, institution_id: inst, body: 'Comentario a moderar' }).select('id').single()
      // Quien participa no puede ocultar comentarios ni cambiar los controles de la publicación.
      await student.db.from('announcement_comments').update({ hidden_at: new Date().toISOString() }).eq('id', comment!.id)
      await guardian.db.from('announcements').update({ comment_roles: ['apoderado', 'estudiante'] }).eq('id', post)
      expect(await count(student.db.from('announcement_comments').select('id', { count: 'exact', head: true }).eq('announcement_id', post))).toBe(1)
      const { data: controls } = await director.db.from('announcements').select('comment_roles').eq('id', post).single()
      expect(controls!.comment_roles).toEqual(['apoderado'])

      expect((await director.db.from('announcement_comments').update({ hidden_at: new Date().toISOString(), hidden_by: director.id }).eq('id', comment!.id)).error).toBeNull()
      expect(await count(student.db.from('announcement_comments').select('id', { count: 'exact', head: true }).eq('announcement_id', post))).toBe(0)
      expect(await count(guardian.db.from('announcement_comments').select('id', { count: 'exact', head: true }).eq('announcement_id', post))).toBe(1)
      expect(await count(director.db.from('announcement_comments').select('id', { count: 'exact', head: true }).eq('announcement_id', post))).toBe(1)
    })
  })

  it('después de publicar no se puede cambiar el contenido ni la audiencia', async () => {
    await withPost(async post => {
      const { db } = await as('directivo')
      expect((await db.from('announcements').update({ title: 'Título cambiado' }).eq('id', post)).error).not.toBeNull()
      expect((await db.from('announcements').update({ audience: ['docente'] }).eq('id', post)).error).not.toBeNull()
    })
  })

  it('otro colegio no ve ni puede tocar reacciones y comentarios', async () => {
    await withPost(async (post, inst) => {
      const guardian = await as('apoderado')
      await guardian.db.from('announcement_reactions').insert({ announcement_id: post, user_id: guardian.id, institution_id: inst, kind: 'thanks' })
      await guardian.db.from('announcement_comments').insert({ announcement_id: post, author_id: guardian.id, institution_id: inst, body: 'Solo para este colegio' })
      const outsider = await as('otroEstudiante')
      const otherInst = await institutionId('otroEstudiante')
      expect(await count(outsider.db.from('announcement_reactions').select('kind', { count: 'exact', head: true }).eq('announcement_id', post))).toBe(0)
      expect(await count(outsider.db.from('announcement_comments').select('id', { count: 'exact', head: true }).eq('announcement_id', post))).toBe(0)
      for (const institution_id of [inst, otherInst]) {
        expect((await outsider.db.from('announcement_reactions').insert({ announcement_id: post, user_id: outsider.id, institution_id, kind: 'like' })).error, institution_id).not.toBeNull()
        expect((await outsider.db.from('announcement_comments').insert({ announcement_id: post, author_id: outsider.id, institution_id, body: 'Intruso' })).error, institution_id).not.toBeNull()
      }
    })
  })
})

describe.runIf(configured)('ficha personal e incidencias del estudiante', () => {
  it('la ficha reservada la ven administración, dirección y la propia persona; nadie más', async () => {
    const [student, other, teacher, guardian, director, admin, outsider] = await Promise.all(
      (['estudiante7', 'estudiante6', 'docenteMat', 'apoderado', 'directivo', 'admin', 'otroAdmin'] as const).map(as))
    const mine = (db: typeof student.db) => count(db.from('person_records').select('user_id', { count: 'exact', head: true }).eq('user_id', student.id))
    expect(await mine(student.db)).toBe(1)
    expect(await mine(director.db)).toBe(1)
    expect(await mine(admin.db)).toBe(1)
    // Poder ver el perfil (docente, apoderada, compañero) no alcanza para ver RUN, domicilio ni contacto de emergencia.
    for (const who of [other, teacher, guardian, outsider]) expect(await mine(who.db)).toBe(0)
  })

  it('solo la administración puede editar la ficha', async () => {
    const [student, director, admin] = await Promise.all((['estudiante7', 'directivo', 'admin'] as const).map(as))
    const read = async () => (await admin.db.from('person_records').select('commune').eq('user_id', student.id).single()).data!.commune as string
    const before = await read()
    await student.db.from('person_records').update({ commune: 'Cambiada por el estudiante' }).eq('user_id', student.id)
    await director.db.from('person_records').update({ commune: 'Cambiada por dirección' }).eq('user_id', student.id)
    expect(await read()).toBe(before)
    try {
      expect((await admin.db.from('person_records').update({ commune: 'Providencia' }).eq('user_id', student.id)).error).toBeNull()
      expect(await read()).toBe('Providencia')
    } finally { await admin.db.from('person_records').update({ commune: before }).eq('user_id', student.id) }
  })

  it('las incidencias las registra y lee el personal del colegio; no el estudiante, su familia ni otro colegio', async () => {
    const [student, guardian, teacher, director, outsider] = await Promise.all((['estudiante7', 'apoderado', 'docenteMat', 'directivo', 'otroDocente'] as const).map(as))
    const inst = await institutionId('directivo')
    const row = { institution_id: inst, student_id: student.id, kind: 'informativa', category: 'otro', description: 'Anotación de prueba automatizada', occurred_on: '2026-10-01' }
    const { data: created, error } = await teacher.db.from('student_incidents').insert({ ...row, recorded_by: teacher.id }).select('id').single()
    expect(error).toBeNull()
    try {
      const seen = (db: typeof student.db) => count(db.from('student_incidents').select('id', { count: 'exact', head: true }).eq('id', created!.id))
      expect(await seen(teacher.db)).toBe(1)
      expect(await seen(director.db)).toBe(1)
      for (const who of [student, guardian, outsider]) expect(await seen(who.db)).toBe(0)
      // Nadie registra a nombre de otra persona, ni desde fuera del colegio, ni el propio estudiante.
      expect((await director.db.from('student_incidents').insert({ ...row, recorded_by: teacher.id })).error).not.toBeNull()
      expect((await outsider.db.from('student_incidents').insert({ ...row, recorded_by: outsider.id })).error).not.toBeNull()
      expect((await student.db.from('student_incidents').insert({ ...row, recorded_by: student.id })).error).not.toBeNull()
    } finally { await teacher.db.from('student_incidents').delete().eq('id', created!.id) }
  })
})
