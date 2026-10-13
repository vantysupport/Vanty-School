import { emailLayout, escHtml } from '@/lib/email/layout'

// Textos de cada correo. Regla común: un correo nunca lleva información sensible (notas, contenido de mensajes,
// motivos de bienestar). Avisa que hay algo y lleva a la plataforma, donde cada persona ve solo lo que le corresponde.

type Mail = { subject: string; html: string }
const first = (name: string) => name.trim().split(/\s+/)[0] || name

/** Invitación a un colegio: enlace de un solo uso para crear la contraseña. */
export function invitationEmail(o: { name: string; school: string; roleLabel: string; link: string; days: number; managed?: boolean; siteUrl?: string | null }): Mail {
  const subject = `${o.school} te invitó a Vanty School`
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: escHtml(o.school), title: `Hola, ${escHtml(first(o.name))}`,
      preheader: `Activa tu cuenta de ${o.roleLabel} en ${o.school}.`,
      intro: `<strong>${escHtml(o.school)}</strong> te invitó a Vanty School. Activa tu cuenta creando tu contraseña.`,
      details: [{ label: 'Perfil', value: escHtml(o.roleLabel) }, { label: 'Colegio', value: escHtml(o.school) }],
      cta: { href: o.link, label: 'Activar mi cuenta' },
      note: `El enlace sirve una sola vez y vence en ${o.days} días.${o.managed ? ' Esta es una cuenta de estudiante: si es menor de edad, debe activarla junto a su apoderado.' : ''} Si no esperabas esta invitación, puedes ignorar este correo.`,
    }),
  }
}

/** Invitación al equipo Vanty. */
export function staffInvitationEmail(o: { name: string; link: string; siteUrl?: string | null }): Mail {
  const subject = 'Te invitaron al equipo de Vanty School'
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: 'Equipo Vanty', title: `Hola, ${escHtml(first(o.name))}`,
      intro: 'Te invitaron al equipo de <strong>Vanty School</strong>. Con esta cuenta podrás crear colegios y acompañar su puesta en marcha.',
      cta: { href: o.link, label: 'Crear mi cuenta' },
      note: 'El enlace sirve una sola vez y vence en 7 días. No lo reenvíes: quien lo use tendrá acceso al panel de plataforma. Si no esperabas esta invitación, ignora este correo.',
    }),
  }
}

/** Restablecer contraseña. */
export function recoveryEmail(o: { link: string; siteUrl?: string | null }): Mail {
  const subject = 'Restablece tu contraseña de Vanty School'
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, title: 'Restablece tu contraseña',
      intro: 'Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Vanty School</strong>. Pulsa el botón para crear una nueva.',
      cta: { href: o.link, label: 'Crear nueva contraseña' },
      note: 'El enlace es de un solo uso y vence pronto. Si no lo pediste, ignora este correo: tu contraseña no cambiará.',
    }),
  }
}

// ── Avisos del día a día. Van en copia oculta a varias personas: por eso no saludan por nombre. ──

/** Comunicado nuevo: lleva el título, no el texto. */
export function announcementEmail(o: { school: string; author: string; title: string; course?: string | null; link: string; siteUrl?: string | null }): Mail {
  const subject = `Nuevo comunicado de ${o.school}`
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: escHtml(o.school), title: 'Hay un comunicado nuevo', preheader: o.title,
      intro: `<strong>${escHtml(o.author)}</strong> publicó un comunicado${o.course ? ` para <strong>${escHtml(o.course)}</strong>` : ''}.`,
      details: [{ label: 'Título', value: escHtml(o.title) }],
      cta: { href: o.link, label: 'Leer el comunicado' },
      note: 'El texto completo y sus imágenes se ven dentro de la plataforma.',
    }),
  }
}

/** Tarea o evaluación publicada, para los apoderados del curso. */
export function assignmentEmail(o: { school: string; kind: string; isTest: boolean; title: string; subject: string; course: string; due: string; link: string; siteUrl?: string | null }): Mail {
  const subject = `${o.kind} de ${o.subject} · ${o.course}`
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: escHtml(o.school), title: o.isTest ? 'Se agendó una evaluación' : 'Hay una tarea nueva', preheader: o.title,
      intro: `El curso <strong>${escHtml(o.course)}</strong> tiene ${o.isTest ? 'una evaluación agendada' : 'una tarea nueva'} en <strong>${escHtml(o.subject)}</strong>.`,
      details: [{ label: o.kind, value: escHtml(o.title) }, { label: o.isTest ? 'Fecha' : 'Entrega', value: escHtml(o.due) }],
      cta: { href: o.link, label: 'Ver el detalle' },
      note: 'Recibes este aviso porque eres apoderado de un estudiante de ese curso.',
    }),
  }
}

/** Nota nueva. No dice cuánto se sacó: eso se ve dentro de la plataforma. */
export function gradeEmail(o: { name: string; school: string; student: string; subject: string; link: string; siteUrl?: string | null }): Mail {
  const subject = `Nota nueva de ${first(o.student)} en ${o.subject}`
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: escHtml(o.school), title: 'Hay una nota nueva',
      intro: `Hola, ${escHtml(first(o.name))}. Se registró una nota nueva de <strong>${escHtml(first(o.student))}</strong> en <strong>${escHtml(o.subject)}</strong>.`,
      cta: { href: o.link, label: 'Ver sus notas' },
      note: 'Por resguardo, la nota y el comentario del docente solo se muestran dentro de la plataforma.',
    }),
  }
}

/** Para el equipo de bienestar: llegó una solicitud. Sin nombres, sin tema, sin texto. */
export function wellbeingRequestEmail(o: { school: string; link: string; siteUrl?: string | null }): Mail {
  const subject = `Nueva solicitud de apoyo en ${o.school}`
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: escHtml(o.school), title: 'Llegó una solicitud de apoyo',
      intro: 'Hay una solicitud nueva esperando revisión del equipo de bienestar.',
      cta: { href: o.link, label: 'Revisar la solicitud' },
      note: 'Por confidencialidad, este correo no indica quién la envió ni de qué se trata. Si es una urgencia, sigue el protocolo del colegio.',
    }),
  }
}

/** Para el apoderado: bienestar respondió su solicitud o le envió un cuestionario. Sin detalles. */
export function wellbeingForGuardianEmail(o: { name: string; school: string; what: 'reply' | 'questionnaire'; link: string; siteUrl?: string | null }): Mail {
  const reply = o.what === 'reply'
  const subject = reply ? `El equipo de bienestar te respondió · ${o.school}` : `El equipo de bienestar te envió un cuestionario · ${o.school}`
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: escHtml(o.school), title: reply ? 'Te respondieron' : 'Tienes un cuestionario por responder',
      intro: `Hola, ${escHtml(first(o.name))}. El equipo de bienestar de <strong>${escHtml(o.school)}</strong> ${reply ? 'respondió tu solicitud de apoyo' : 'te envió un cuestionario para acompañar mejor a tu pupilo'}.`,
      cta: { href: o.link, label: reply ? 'Leer la respuesta' : 'Responder el cuestionario' },
      note: 'Por confidencialidad, el contenido solo se muestra dentro de la plataforma.',
    }),
  }
}

/** Aviso de mensaje nuevo. No incluye el texto del mensaje ni el nombre del estudiante. */
export function newMessageEmail(o: { name: string; from: string; school: string; link: string; meeting?: boolean; siteUrl?: string | null }): Mail {
  const subject = o.meeting ? `Solicitud de reunión en ${o.school}` : `Tienes un mensaje nuevo en ${o.school}`
  return {
    subject,
    html: emailLayout({
      subject, siteUrl: o.siteUrl, eyebrow: escHtml(o.school), title: o.meeting ? 'Te pidieron una reunión' : 'Tienes un mensaje nuevo',
      intro: `Hola, ${escHtml(first(o.name))}. <strong>${escHtml(o.from)}</strong> te ${o.meeting ? 'envió una solicitud de reunión' : 'escribió'} en Vanty School.`,
      cta: { href: o.link, label: 'Leer el mensaje' },
      note: 'Por resguardo, el contenido del mensaje solo se muestra dentro de la plataforma.',
    }),
  }
}
