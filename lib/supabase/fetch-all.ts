/** La API entrega como máximo 1.000 filas por consulta. Con un colegio completo varias listas superan ese tope
 *  (matrículas, vínculos con apoderados, asistencia de un curso): se pide por tramos hasta agotar.
 *  La consulta debe venir con un orden estable para que los tramos no se pisen. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>, size = 1000): Promise<{ data: T[] }> {
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data } = await page(from, from + size - 1)
    out.push(...(data ?? []))
    if ((data?.length ?? 0) < size) break
  }
  return { data: out }
}
