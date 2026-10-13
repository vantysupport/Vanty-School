// Plantillas de cuestionarios para la familia. Son descriptivas: sirven para conocer mejor al estudiante y abrir
// la conversación con su apoderado. No son instrumentos clínicos, no están validadas psicométricamente y no
// entregan puntajes, puntos de corte ni categorías. La lectura es siempre de la persona profesional.

export type TemplateQuestion = { id: string; text: string; type: 'scale' | 'text'; min?: number; max?: number; minLabel?: string; maxLabel?: string; section?: string }
export type StarterTemplate = {
  key: string; title: string; minutes: number; topic: string
  description: string     // lo lee también el apoderado
  readingGuide: string    // solo para el equipo de bienestar (y para ARIA)
  sections: { title: string; items: (string | { open: string })[] }[]
}

export const TEMPLATE_AUTHORIZATION = 'Cuestionario descriptivo original de VANTY School para conversar con la familia. No es un instrumento clínico ni está validado psicométricamente; no entrega puntajes, puntos de corte ni categorías.'
const FREQ = { min: 1, max: 5, minLabel: 'Nunca', maxLabel: 'Siempre' }

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'conociendo', title: 'Conociendo a mi hijo o hija', minutes: 10, topic: 'Primer acercamiento',
    description: 'Queremos conocer mejor a tu hijo o hija para acompañarle bien en el colegio. No hay respuestas correctas: cuéntanos cómo es en casa, con tus palabras.',
    readingGuide: 'Sirve para abrir el vínculo con la familia y recoger su mirada antes de la primera entrevista. Atiende a las fortalezas e intereses que nombran (son puntos de apoyo para el acompañamiento), a cómo describen las dificultades (hechos o juicios), a qué funciona en casa para calmarle, y a los cambios recientes en la familia. Contrasta lo que la familia ve en casa con lo observado en el colegio: las diferencias entre contextos suelen orientar más que las coincidencias.',
    sections: [
      { title: 'Cómo es', items: [{ open: '¿Qué es lo que más disfruta hacer? ¿Qué le interesa o le entusiasma?' }, { open: '¿En qué cosas dirías que es bueno o buena? ¿Qué te enorgullece de él o ella?' }, { open: '¿Cómo lo describirías en tres palabras?' }] },
      { title: 'En el día a día', items: ['Cuenta en casa lo que le pasa en el colegio', 'Se relaciona con facilidad con otros niños, niñas o jóvenes', 'Pide ayuda cuando algo le resulta difícil', 'Se adapta bien cuando hay cambios en la rutina', 'Va al colegio con ánimo'] },
      { title: 'Lo que le cuesta y lo que le ayuda', items: [{ open: '¿Qué situaciones le resultan más difíciles? ¿Qué pasa en esos momentos?' }, { open: 'Cuando se enoja, se frustra o se pone triste, ¿qué le ayuda a calmarse?' }] },
      { title: 'La familia', items: [{ open: '¿Con quiénes vive y quién le acompaña después del colegio?' }, { open: '¿Ha habido algún cambio importante en la familia este último tiempo? (mudanza, nacimiento, separación, enfermedad, pérdida, trabajo)' }, { open: '¿Qué te gustaría que el colegio supiera o tuviera en cuenta? ¿Qué esperas de este acompañamiento?' }] },
    ],
  },
  {
    key: 'rutinas', title: 'Rutinas y descanso en casa', minutes: 6, topic: 'Hábitos',
    description: 'El descanso, la alimentación y las rutinas influyen mucho en cómo se siente y aprende. Responde pensando en una semana normal de clases.',
    readingGuide: 'Mira la regularidad más que cada respuesta suelta: horarios de sueño irregulares, dificultad para despertar y pantallas antes de dormir suelen ir juntos y pueden asociarse a cansancio y baja atención en las primeras horas. Considera la etapa del desarrollo (en la adolescencia el sueño tiende a retrasarse). Venir sin desayuno o con poca actividad física son datos a conversar, no a juzgar: pregunta por las condiciones de la familia (horarios de trabajo, traslados). Cruza con la asistencia y con lo que reportan los docentes de la primera hora.',
    sections: [
      { title: 'Sueño', items: ['Se acuesta a una hora parecida los días de clases', 'Duerme las horas que necesita para su edad', 'Le cuesta levantarse en las mañanas', 'Usa celular, tablet o televisión justo antes de dormir', 'Se ve con sueño o cansado durante el día', { open: '¿A qué hora suele dormirse y a qué hora se levanta en día de clases?' }] },
      { title: 'Alimentación y movimiento', items: ['Toma desayuno antes de ir al colegio', 'Come a horarios parecidos cada día', 'Hace actividad física o juega al aire libre durante la semana'] },
      { title: 'Rutina', items: ['Tiene una rutina conocida después del colegio', 'Un adulto está disponible en casa por las tardes', { open: '¿Hay algo de la rutina de la casa que te gustaría cambiar o en lo que necesiten apoyo?' }] },
    ],
  },
  {
    key: 'estudio', title: 'Estudio y tareas en casa', minutes: 6, topic: 'Aprendizaje',
    description: 'Cuéntanos cómo es el momento de las tareas y el estudio en casa. Nos ayuda a coordinar mejor el apoyo entre la familia y el colegio.',
    readingGuide: 'Distingue entre condiciones (lugar, horario, materiales, adulto disponible) y desempeño (inicia, sostiene, termina). Si las condiciones existen pero le cuesta iniciar o se frustra rápido, vale la pena explorar la dificultad de las tareas y posibles vacíos previos en esa asignatura, además de la organización. Si la familia hace las tareas por él o ella, o hay conflicto frecuente, el foco puede estar en la relación con el estudio en casa más que en el contenido. Contrasta con las asignaturas descendidas y con lo que observan los docentes.',
    sections: [
      { title: 'Condiciones', items: ['Tiene un lugar tranquilo para estudiar o hacer tareas', 'Tiene un horario más o menos fijo para las tareas', 'Cuenta con los materiales que necesita', 'Un adulto puede acompañarle o revisar lo que hizo'] },
      { title: 'Cómo trabaja', items: ['Empieza las tareas sin que haya que insistirle', 'Termina lo que empieza', 'Sabe qué tareas tiene y para cuándo', 'Se frustra o se enoja cuando algo no le resulta', 'El momento de las tareas termina en discusión', 'Pide ayuda cuando no entiende'] },
      { title: 'Tu mirada', items: [{ open: '¿En qué asignatura o tipo de tarea notas que le cuesta más? ¿Qué pasa ahí?' }, { open: '¿Qué ha funcionado en casa para que estudie mejor? ¿Qué no ha funcionado?' }] },
    ],
  },
  {
    key: 'animo', title: 'Ánimo y convivencia en casa', minutes: 7, topic: 'Bienestar',
    description: 'Queremos saber cómo ves a tu hijo o hija en casa este último mes. Responde según lo que observas; no necesitas interpretar. Si hay algo urgente que te preocupa, no esperes: comunícate directamente con el colegio.',
    readingGuide: 'Es un cuestionario de observación de conductas, no una medida del estado emocional: no suma ni clasifica. Fíjate en los cambios respecto de cómo era antes más que en la frecuencia aislada, y en si aparecen varias señales juntas (retraimiento, irritabilidad, quejas físicas antes del colegio, pérdida de interés). Las quejas físicas en la mañana y la resistencia a asistir merecen conversarse pronto y cruzarse con la asistencia. Cualquier mención de la familia a daño, miedo a una persona o situaciones de violencia activa el protocolo del colegio: no se gestiona desde el cuestionario.',
    sections: [
      { title: 'Cómo le ves', items: ['Se le ve contento o tranquilo la mayor parte del tiempo', 'Conversa con la familia sobre lo que le pasa', 'Disfruta las cosas que normalmente le gustan', 'Se irrita o se enoja con facilidad', 'Prefiere estar solo o sola más que antes', 'Se le ve preocupado o nervioso'] },
      { title: 'El colegio visto desde casa', items: ['Se queja de dolor de cabeza, de guata u otro malestar antes de ir al colegio', 'Pone resistencia para ir al colegio', 'Habla de sus compañeros o amigos con gusto', { open: '¿Te ha contado algo del colegio que le moleste, le asuste o le ponga triste?' }] },
      { title: 'Convivencia', items: ['Respeta los acuerdos y límites de la casa', 'Las discusiones en casa se resuelven conversando', { open: '¿Has notado algún cambio en su forma de ser o de comportarse este último tiempo? ¿Desde cuándo?' }] },
    ],
  },
  {
    key: 'pantallas', title: 'Pantallas y tiempo libre', minutes: 5, topic: 'Hábitos',
    description: 'Cuéntanos cómo usa su tiempo libre y las pantallas. No se trata de evaluar a la familia: nos sirve para entender su día completo.',
    readingGuide: 'El dato útil no es la cantidad de horas sino qué desplaza el uso de pantallas (sueño, estudio, juego, vida social) y si hay acuerdos y acompañamiento adulto. Pregunta por el tipo de uso: jugar con amigos, ver videos a solas y redes sociales no son lo mismo. La irritabilidad al cortar el uso y el uso nocturno conviene cruzarlos con el descanso. Observa también las actividades que disfruta sin pantallas: son recursos para el acompañamiento. Si la familia menciona situaciones de acoso o contacto con desconocidos en internet, corresponde activar el protocolo del colegio.',
    sections: [
      { title: 'Uso de pantallas', items: ['Usa pantallas más tiempo del que la familia quisiera', 'Hay acuerdos en casa sobre cuándo y cuánto usarlas', 'Un adulto sabe qué ve, juega o con quién habla en internet', 'Se molesta mucho cuando tiene que dejar la pantalla', 'Usa pantallas durante las comidas o en la noche', { open: '¿Para qué las usa principalmente? (jugar, videos, redes sociales, conversar con amigos, tareas)' }] },
      { title: 'Tiempo libre', items: ['Hace actividades que le gustan sin pantallas', 'Comparte tiempo de juego o conversación con la familia', 'Se junta con amigos fuera del colegio', { open: '¿Participa en algún taller, deporte o actividad fuera del colegio? ¿Cuál?' }] },
    ],
  },
]

/** Convierte una plantilla en la lista de preguntas que guarda un instrumento. */
export function starterQuestions(t: StarterTemplate): TemplateQuestion[] {
  let n = 0
  return t.sections.flatMap(s => s.items.map(item => {
    n += 1
    return typeof item === 'string'
      ? { id: `q${n}`, text: item, type: 'scale' as const, ...FREQ, section: s.title }
      : { id: `q${n}`, text: item.open, type: 'text' as const, section: s.title }
  }))
}
