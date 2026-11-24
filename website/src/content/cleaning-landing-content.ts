export const CLEANING_LANDING_SEO = {
  title: "Software para empresas de limpieza | Dinamic Operations",
  description:
    "Coordiná tus equipos de limpieza, planificá servicios por edificio y controlá las asistencias en tiempo real con Dinamic Operations. Pedí una demo.",
  canonicalUrl: "https://dinamicoperations.com/software-empresas-limpieza/",
  pathname: "/software-empresas-limpieza/",
} as const;

export const CLEANING_LANDING_HERO = {
  title: "Coordiná tus equipos de limpieza en cada edificio.",
  lead:
    "Planificá quién cubre cada servicio y en qué horario. Cuando arranca el turno, ves en un solo tablero quién llegó y qué edificio necesita atención.",
  ctaPrimary: { label: "Pedí una demo", href: "/#solicitar-demo" as const },
} as const;

export const CLEANING_LANDING_USE_CASE = {
  narrative:
    "Son las 7 y arrancan tres servicios. En dos edificios llegó todo el equipo. En el tercero falta una persona. El supervisor ve dónde hace falta cobertura y puede decidir a quién reasignar.",
} as const;

/** Origen: presentation-production/qa/funcional/slide-01.png (dataset demo SS-01, sin datos reales de clientes). */
export const CLEANING_LANDING_DASHBOARD_IMAGE = {
  src: "/marketing/cleaning-landing/tablero-operativo.webp",
  alt: "Tablero operativo de Dinamic Operations con cobertura y asistencias por servicio y edificio",
  width: 2667,
  height: 1500,
} as const;