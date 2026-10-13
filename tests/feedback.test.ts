import { describe, expect, it } from 'vitest'
import { feedbackWatchlist } from '@/lib/feedback'

const row = (teacher_id: string, month: string, responses: number, score: number) => ({ teacher_id, month, responses, score })

describe('aviso de clases que podrían necesitar apoyo', () => {
  it('avisa cuando la evaluación del mes queda bajo 3,5', () => {
    const list = feedbackWatchlist([row('a', '2026-10-01', 8, 3.2), row('b', '2026-10-01', 8, 4.3)])
    expect(list.map(w => w.teacherId)).toEqual(['a'])
    expect(list[0].low).toBe(true)
  })

  it('avisa cuando baja medio punto o más frente al mes anterior, aunque siga sobre 3,5', () => {
    const list = feedbackWatchlist([row('a', '2026-09-01', 10, 4.6), row('a', '2026-10-01', 10, 4.0), row('b', '2026-09-01', 10, 4.2), row('b', '2026-10-01', 10, 4.0)])
    expect(list.map(w => w.teacherId)).toEqual(['a'])
    expect(list[0]).toMatchObject({ dropped: true, low: false })
  })

  it('no avisa con menos de cinco respuestas en el mes', () => {
    expect(feedbackWatchlist([row('a', '2026-10-01', 4, 2.0)])).toEqual([])
  })

  it('promedia todos los cursos del docente según cuántos respondieron', () => {
    // 3,0 con 3 respuestas y 4,5 con 9: el promedio del docente es 4,1 y no debe avisar.
    expect(feedbackWatchlist([row('a', '2026-10-01', 3, 3.0), row('a', '2026-10-01', 9, 4.5)])).toEqual([])
  })

  it('ordena primero la evaluación más baja', () => {
    const list = feedbackWatchlist([row('a', '2026-10-01', 6, 3.4), row('b', '2026-10-01', 6, 2.9)])
    expect(list.map(w => w.teacherId)).toEqual(['b', 'a'])
  })
})
