import { describe, expect, it } from 'vitest'
import { anonClient, as, configured, institutionId } from './helpers'
import { baseFor, coverStyle, setupSteps, type SchoolDetail } from '@/lib/platform'

// El nivel de plataforma (equipo Vanty) no es un rol de colegio. Estas pruebas comprueban, contra la base real,
// que ninguna cuenta de un colegio puede usarlo, ni siquiera secretaría o dirección.

const uuid = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!configured)('panel de plataforma: cerrado para las cuentas de los colegios', () => {
  it('secretaría, dirección, docente y estudiante no pueden listar ni crear colegios', async () => {
    for (const role of ['admin', 'directivo', 'docenteMat', 'estudiante7'] as const) {
      const { db } = await as(role)
      const overview = await db.rpc('platform_overview')
      expect(overview.error?.code, `${role}: listar`).toBe('42501')
      const create = await db.rpc('platform_create_institution', { p_name: 'Colegio Intruso', p_rbd: '', p_dependency: 'municipal', p_commune: '', p_region: '', p_year: 2026, p_stages: ['basica'], p_subjects: true })
      expect(create.error?.code, `${role}: crear`).toBe('42501')
    }
  })

  it('secretaría no puede suspender otro colegio ni invitar a su administración', async () => {
    const { db } = await as('admin')
    const other = await institutionId('otroAdmin')
    expect((await db.rpc('platform_set_status', { p_inst: other, p_status: 'suspended' })).error?.code).toBe('42501')
    expect((await db.rpc('platform_invite', { p_inst: other, p_email: 'intruso@ejemplo.cl', p_full_name: 'Intruso', p_role: 'admin', p_token_hash: 'x'.repeat(64) })).error?.code).toBe('42501')
    expect((await db.rpc('platform_institution', { p_inst: other })).error?.code).toBe('42501')
    const { data } = await db.from('institutions').select('status').eq('id', other)
    expect(data ?? []).toEqual([])   // sigue sin verlo, y no cambió nada
  })

  it('nadie de un colegio ve ni modifica el equipo Vanty', async () => {
    const { db, id } = await as('directivo')
    expect((await db.rpc('platform_team')).error?.code).toBe('42501')
    expect((await db.from('platform_staff').select('user_id')).data ?? []).toEqual([])
    expect((await db.from('platform_invitations').select('id')).data ?? []).toEqual([])
    expect((await db.from('platform_staff').insert({ user_id: id })).error).not.toBeNull()   // no puede sumarse solo
    expect((await db.rpc('platform_invite_staff', { p_email: 'yo@ejemplo.cl', p_full_name: 'Yo Mismo', p_token_hash: 'y'.repeat(64) })).error?.code).toBe('42501')
    expect((await db.rpc('platform_remove_staff', { p_user: uuid })).error?.code).toBe('42501')
  })

  it('un visitante sin sesión no puede llamar a ninguna función de plataforma', async () => {
    const db = anonClient()
    for (const fn of ['platform_overview', 'platform_team']) expect((await db.rpc(fn)).error, fn).not.toBeNull()
    expect((await db.from('platform_staff').select('user_id')).data ?? []).toEqual([])
  })
})

describe.skipIf(!configured)('identidad del colegio', () => {
  it('nadie de un colegio usa las funciones de identidad de la plataforma', async () => {
    const { db } = await as('admin')
    const other = await institutionId('otroAdmin')
    expect((await db.rpc('platform_branding')).error?.code).toBe('42501')
    expect((await db.rpc('platform_set_branding', { p_inst: other, p_color: '#000000', p_address: '', p_phone: '' })).error?.code).toBe('42501')
    expect((await db.rpc('platform_set_logo', { p_inst: other, p_path: `${other}/logo.png` })).error?.code).toBe('42501')
  })

  it('secretaría no puede apuntar el logo fuera de la carpeta de su colegio, y dirección no lo cambia', async () => {
    const { db } = await as('admin')
    const mine = await institutionId('admin')
    const other = await institutionId('otroAdmin')
    expect((await db.from('institutions').update({ logo_path: `${other}/logo.png` }).eq('id', mine).select('id')).error).not.toBeNull()
    expect((await db.from('institutions').update({ logo_path: `${mine}/../x.png` }).eq('id', mine).select('id')).error).not.toBeNull()
    expect((await db.from('institutions').update({ brand_color: 'rojo' }).eq('id', mine).select('id')).error).not.toBeNull()
    const { db: director } = await as('directivo')
    expect((await director.from('institutions').update({ brand_color: '#123456' }).eq('id', mine).select('id')).data ?? []).toEqual([])
  })

  it('un docente no puede subir un logo', async () => {
    const { db } = await as('docenteMat')
    const mine = await institutionId('admin')
    const { error } = await db.storage.from('school-logos').upload(`${mine}/intruso.png`, new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }))
    expect(error).not.toBeNull()
  })
})

describe('lo que se crea con el colegio', () => {
  it('calcula grados y asignaturas igual que la base de datos', () => {
    expect(baseFor(['parvularia', 'basica', 'media'], true)).toEqual({ grades: 14, subjects: 15 })
    expect(baseFor(['basica', 'media'], true)).toEqual({ grades: 12, subjects: 15 })
    expect(baseFor(['parvularia'], true)).toEqual({ grades: 2, subjects: 5 })
    expect(baseFor(['media'], false)).toEqual({ grades: 4, subjects: 0 })
  })

  it('la portada usa el color del colegio y descarta valores inválidos', () => {
    expect(coverStyle('#047857').background).toContain('#047857')
    expect(coverStyle('javascript:alert(1)').background).toContain('#0069db')
    expect(coverStyle(null).background).toContain('#0069db')
  })
})

describe('puesta en marcha de un colegio', () => {
  const base: SchoolDetail = {
    id: uuid, name: 'Colegio Nuevo', rbd: null, dependency: 'municipal', commune: null, region: null, status: 'active', is_demo: false, created_at: '2026-10-13T00:00:00Z',
    period: { name: 'Segundo semestre', year: 2026, starts_on: '2026-07-31', ends_on: '2026-12-08' },
    grade_levels: 14, subjects: 15, courses: 0, assignments: 0, links: 0, members: {}, contacts: [], invitations: [],
  }

  it('un colegio recién creado tiene listos solo los pasos del equipo Vanty', () => {
    const steps = setupSteps(base)
    expect(steps.filter(s => s.done).map(s => s.title)).toEqual(['Colegio creado', 'Grados y asignaturas'])
    expect(steps.find(s => !s.done)?.title).toBe('Secretaría con cuenta activa')
  })

  it('distingue una invitación sin aceptar de una secretaría sin invitar', () => {
    const invited = setupSteps({ ...base, invitations: [{ id: uuid, email: 's@c.cl', name: 'S', role: 'admin', expires_at: '2026-10-20T00:00:00Z', state: 'pending' }] })
    expect(invited[2].detail).toMatch(/sin aceptar/)
    expect(setupSteps(base)[2].detail).toMatch(/Invita/)
  })

  it('los docentes cuentan como listos solo cuando tienen asignaturas asignadas', () => {
    const invitedOnly = setupSteps({ ...base, members: { admin: 1, docente: 5 }, courses: 3 })
    expect(invitedOnly.find(s => s.title === 'Docentes con sus asignaturas')?.done).toBe(false)
    const assigned = setupSteps({ ...base, members: { admin: 1, docente: 5 }, courses: 3, assignments: 12 })
    expect(assigned.find(s => s.title === 'Docentes con sus asignaturas')?.done).toBe(true)
  })

  it('un colegio completo marca todos los pasos', () => {
    const full = setupSteps({ ...base, members: { admin: 1, docente: 5, estudiante: 80, apoderado: 70 }, courses: 4, assignments: 20, links: 80 })
    expect(full.every(s => s.done)).toBe(true)
  })
})
