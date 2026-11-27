export const CLEANING_LANDING_SEO = {
  title: "Software para empresas de limpieza | Dinamic Operations",
  description:
    "Coordiná tus equipos de limpieza, planificá servicios por edificio y controlá las asistencias en tiempo real con Dinamic Operations. Pedí una demo.",
  canonicalUrl: "https://dinamicoperations.com/software-empresas-limpieza/",
  pathname: "/software-empresas-limpieza/",
} as const;

export const CLEANING_LANDING_INTERNAL_LINKS = {
  comoFunciona: "/#como-funciona",
  situaciones: "/#situaciones",
  solicitarDemo: "/#solicitar-demo",
} as const;

export const CLEANING_LANDING_HERO = {
  title: "Coordiná tus equipos de limpieza en cada edificio.",
  lead:
    "Planificá quién cubre cada servicio y en qué horario. Cuando arranca el turno, ves en un solo tablero quién llegó y qué edificio necesita atención.",
  ctaPrimary: { label: "Pedí una demo", href: CLEANING_LANDING_INTERNAL_LINKS.solicitarDemo },
} as const;

export const CLEANING_LANDING_USE_CASE = {
  sectionTitle: "Un día típico en la operación",
  narrative:
    "Son las 7 y arrancan tres servicios. En dos edificios llegó todo el equipo. En el tercero falta una persona. El supervisor ve dónde hace falta cobertura y puede decidir a quién reasignar.",
} as const;

export const CLEANING_LANDING_PROBLEMS = {
  sectionTitle: "Qué resuelve en una empresa de limpieza",
  intro:
    "Dinamic Operations es una plataforma de gestión operativa para empresas con personal repartido en muchos edificios y horarios. No se limita a registrar fichadas: te da visibilidad del servicio y herramientas para actuar cuando algo se desvía.",
  items: [
    {
      title: "Planificá servicios por edificio y horario.",
      problem:
        "Sin una planificación clara, cada edificio queda en una planilla distinta y los supervisores pierden tiempo confirmando quién debería estar en cada turno.",
      solution:
        "En Dinamic Operations organizás servicios, equipos y horarios por ubicación. El responsable de operaciones arma la cobertura del día con criterio único y la comparte con el equipo.",
      benefit:
        "Menos idas y vueltas al inicio del turno y más claridad para gerencia sobre cómo está armada la operación.",
    },
    {
      title: "Sabé quién llegó al inicio del turno.",
      problem:
        "Cuando el personal está disperso, no alcanza con asumir que todos llegaron: el cliente del edificio puede notar la falta antes que vos.",
      solution:
        "Las personas registran la llegada por WhatsApp y comparten ubicación en el momento del ingreso. La validación de ubicación confirma que están en el servicio asignado.",
      benefit:
        "El supervisor ve en el tablero quién marcó llegada y en qué edificio, sin depender de llamados o mensajes sueltos.",
    },
    {
      title: "Detectá ausencias y puestos sin cubrir.",
      problem:
        "Una ausencia al arranque deja el servicio expuesto. Si la detectás tarde, el reemplazo llega cuando el daño operativo ya está hecho.",
      solution:
        "La vista operativa contrasta quién debía trabajar con quién registró asistencia. Las alertas ayudan a ver incidencias, demoras o huecos antes de que se conviertan en reclamos.",
      benefit:
        "Podés priorizar edificios críticos y decidir acciones con datos en tiempo real, no con suposiciones.",
    },
    {
      title: "Reasigná con alternativas disponibles.",
      problem:
        "Cuando falta alguien, rearmar el equipo por chat o llamadas encadena errores y nadie ve el impacto en el resto de los servicios.",
      solution:
        "Ante una falta, podés evaluar alternativas y mover personal entre servicios sabiendo qué queda cubierto. Dinamic Operations mantiene visible el estado de cada edificio mientras ajustás la asignación.",
      benefit:
        "Las decisiones de cobertura son más rápidas y quedan respaldadas en el sistema para explicar qué pasó en la operación.",
    },
  ],
} as const;

export const CLEANING_LANDING_TEAM_WORKFLOW_CLOSING = {
  beforeComoFunciona:
    "Para ver el recorrido completo del producto, podés mirar el video de la home en ",
  comoFuncionaLabel: "cómo funciona",
  betweenLinks: " o las ",
  situacionesLabel: "situaciones operativas",
  afterSituaciones: " que mostramos en el sitio.",
} as const;

export const CLEANING_LANDING_TEAM_WORKFLOW = {
  sectionTitle: "Cómo se trabaja con el equipo",
  paragraphs: [
    "Primero definís en el sistema los servicios por edificio, las personas asignadas y los horarios de cada turno. Esa base es la que después compara el tablero con la realidad del día.",
    "Al comenzar el turno, cada persona usa WhatsApp para registrar la llegada y envía su ubicación. No necesitan instalar una app aparte: el flujo es el mismo canal que ya usan para coordinarse.",
    "Dinamic Operations valida que la ubicación corresponda al servicio planificado y registra la asistencia con trazabilidad. Supervisores y responsables de operaciones siguen el estado desde la vista operativa.",
    "Si alguien no llega o marca fuera de horario, las incidencias se hacen visibles en el tablero. Desde ahí podés revisar alternativas y confirmar reasignaciones sin perder el hilo de qué edificio quedó expuesto.",
  ],
} as const;

export const CLEANING_FAQ_IDS = {
  multiBuildingAttendance: "multi-building-attendance",
  appRequired: "app-required",
  detectAbsence: "detect-absence",
  replacements: "replacements",
  requestDemo: "request-demo",
} as const;

export type CleaningFaqAnswerLinkSegment = {
  type: "link";
  href: string;
  label: string;
};

export type CleaningFaqAnswerTextSegment = {
  type: "text";
  value: string;
};

export type CleaningFaqAnswerSegments = ReadonlyArray<CleaningFaqAnswerTextSegment | CleaningFaqAnswerLinkSegment>;

export type CleaningFaqItem = {
  id: (typeof CLEANING_FAQ_IDS)[keyof typeof CLEANING_FAQ_IDS];
  question: string;
  answer: string | CleaningFaqAnswerSegments;
};

export const CLEANING_LANDING_FAQ = {
  sectionTitle: "Preguntas frecuentes",
  items: [
    {
      id: CLEANING_FAQ_IDS.multiBuildingAttendance,
      question: "¿Cómo puedo controlar la asistencia de empleados que trabajan en distintos edificios?",
      answer:
        "Planificás cada servicio con su edificio y horario. Cuando arranca el turno, las personas marcan llegada por WhatsApp con ubicación y ves el resultado en un tablero común. Así comparás lo planificado con lo que ocurrió en cada edificio, sin revisar hoja por hoja.",
    },
    {
      id: CLEANING_FAQ_IDS.appRequired,
      question: "¿Los empleados necesitan instalar una aplicación?",
      answer:
        "No. El registro de asistencia se hace por WhatsApp: envían el mensaje de llegada y comparten la ubicación en el momento del ingreso. Eso reduce fricción para operarios que rotan entre clientes y edificios.",
    },
    {
      id: CLEANING_FAQ_IDS.detectAbsence,
      question: "¿Cómo puedo detectar una ausencia o un puesto sin cubrir?",
      answer:
        "El tablero operativo muestra quienes debían presentarse y quienes ya registraron asistencia. Si falta alguien al inicio del servicio o aparece una demora, la incidencia queda visible para que el supervisor actúe antes de que el cliente lo note.",
    },
    {
      id: CLEANING_FAQ_IDS.replacements,
      question: "¿Cómo se gestionan los reemplazos?",
      answer:
        "Cuando hay una falta, podés revisar alternativas y mover personal entre servicios desde la gestión operativa. El objetivo es cubrir el edificio afectado manteniendo visibilidad de qué otros turnos quedan impactados por el cambio.",
    },
    {
      id: CLEANING_FAQ_IDS.requestDemo,
      question: "¿Cómo puedo solicitar una demostración?",
      answer: [
        { type: "text", value: "Completá el " },
        {
          type: "link",
          href: CLEANING_LANDING_INTERNAL_LINKS.solicitarDemo,
          label: "formulario de demostración en el sitio",
        },
        {
          type: "text",
          value:
            ". Contanos cuántas personas coordinás y en cuántos edificios trabajan; te contactamos para mostrarte el tablero con un caso parecido al tuyo.",
        },
      ],
    },
  ] satisfies ReadonlyArray<CleaningFaqItem>,
} as const;

export const CLEANING_LANDING_FINAL_CTA = {
  title: "Coordiná limpieza por edificio con visibilidad en tiempo real",
  lead: "Contanos tu operación y te mostramos el tablero en una demo guiada.",
} as const;

/** Origen: presentation-production/qa/funcional/slide-01.png (dataset demo SS-01, sin datos reales de clientes). */
export const CLEANING_LANDING_DASHBOARD_IMAGE = {
  src: "/marketing/cleaning-landing/tablero-operativo.webp",
  alt: "Tablero operativo de Dinamic Operations con cobertura y asistencias por servicio y edificio",
  width: 2667,
  height: 1500,
} as const;

export function cleaningFaqAnswerPlainText(item: CleaningFaqItem): string {
  if (typeof item.answer === "string") {
    return item.answer;
  }
  return item.answer.map((segment) => (segment.type === "text" ? segment.value : segment.label)).join("");
}