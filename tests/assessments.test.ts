import { describe, expect, it } from 'vitest'
import { weightedAverage } from '@/lib/assessments'

describe('promedio ponderado de una asignatura', () => {
  it('sin porcentajes es el promedio simple', () => {
    const grades = [{ score: 4, weight: null }, { score: 6, weight: null }]

    expect(weightedAverage(grades, 0)).toBe(5)
  })

  it('el examen pesa su porcentaje y el resto se reparte entre las demás notas', () => {
    // Examen 30 % con un 7,0; dos tareas (5,0 y 3,0, promedio 4,0) comparten el 70 % restante.
    const grades = [{ score: 7, weight: 30 }, { score: 5, weight: null }, { score: 3, weight: null }]

    expect(weightedAverage(grades, 30)).toBeCloseTo(4.9, 5)
  })

  it('si aún no se rinde el examen, se promedia solo lo que ya tiene nota', () => {
    const grades = [{ score: 5, weight: null }, { score: 3, weight: null }]

    expect(weightedAverage(grades, 30)).toBe(4)
  })

  it('con todo ponderado respeta cada porcentaje', () => {
    const grades = [{ score: 6, weight: 60 }, { score: 4, weight: 40 }]

    expect(weightedAverage(grades, 100)).toBeCloseTo(5.2, 5)
  })

  it('sin notas no hay promedio', () => {
    expect(weightedAverage([], 30)).toBeNull()
  })
})
