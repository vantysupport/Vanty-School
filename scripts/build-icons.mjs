// Genera el favicon y los iconos de la app a partir del isotipo de VANTY School.
import sharp from 'sharp'

const src = 'public/brand/vanty-school-mark.webp'
const rounded = async (size, radiusPct) => {
  const r = Math.round(size * radiusPct)
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`)
  return sharp(src).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png()
}

await (await rounded(256, 0.22)).toFile('app/icon.png')
await sharp(src).resize(180, 180).png().toFile('app/apple-icon.png')
console.log('Iconos generados')
