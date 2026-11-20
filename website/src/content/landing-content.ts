/** Fuente del master: presentation-production/video-60s/output/ (carpeta gitignored). Copiar al actualizar. */
export const PRODUCT_VIDEO = {
  src: "/video/dinamic-operations-60s-horizontal.mp4",
  title: "Dinamic Operations — demostración de 60 segundos",
  width: 1920,
  height: 1080,
} as const;

export const LANDING_SEO = {
  title: "Software de gestión de personal y servicios | Dinamic Operations",
  description:
    "Planificá servicios, asigná personal y controlá asistencias en tiempo real. Detectá ausencias y puestos sin cubrir con Dinamic Operations.",
  canonicalUrl: "https://dinamicoperations.com/",
} as const;

export const HERO_CONTENT = {
  title: "Software para gestionar personal y servicios en distintas ubicaciones",
  lead:
    "Planificá quién cubre cada servicio, controlá la asistencia en tiempo real y detectá ausencias, llegadas tarde o puestos sin cubrir para actuar a tiempo.",
  ctaPrimary: { label: "Pedí una demo", href: "#solicitar-demo" as const },
  ctaSecondary: { label: "Ver cómo funciona", href: "#como-funciona" as const },
} as const;

export const EMPLOYEE_COUNT_RANGES = [
  { value: "1-25", label: "1 – 25" },
  { value: "26-100", label: "26 – 100" },
  { value: "101-500", label: "101 – 500" },
  { value: "501+", label: "Más de 500" },
] as const;

export const SITUATIONS = [
  {
    id: "missing-person",
    title: "Faltó una persona",
    line: "Detectás el hueco y ves alternativas sin rearmar todo en un chat.",
  },
  {
    id: "tomorrow-team",
    title: "Armá el equipo de mañana",
    line: "Planificás servicios, personas y horarios en un solo lugar.",
  },
  {
    id: "services-started",
    title: "¿Arrancaron todos los servicios?",
    line: "Una vista del estado real de la operación, servicio por servicio.",
  },
  {
    id: "move-person",
    title: "Mover a alguien sin otro problema",
    line: "Evaluás el impacto antes de confirmar un cambio.",
  },
] as const;

export const SITUATIONS_SUPPORTING_TEXT =
  "Lo que pasa en la operación, lo ves y lo resolvés sin desarmar todo por chat.";

export const AUDIENCE_ITEMS = [
  "Empresas de limpieza",
  "Facility services",
  "Servicios tercerizados",
  "Múltiples clientes y ubicaciones",
] as const;

/** DIN-452 — copy comercial alineado al catálogo LANZAMIENTO (sin importar montos del backend). */
export const COMMERCIAL_SECTION = {
  eyebrow: "Comenzá con Dinamic Operations",
  title: "Todo lo que necesitás para empezar",
  lead:
    "Dinamic Operations es una plataforma lista para usar. Te introducimos a sus herramientas y te guiamos en el proceso inicial para que puedas comenzar a gestionar tu operación.",
  steps: [
    {
      id: "intro",
      title: "Introducción",
      description: "Conocé la plataforma y sus herramientas.",
      icon: "platform" as const,
    },
    {
      id: "orientation",
      title: "Orientación inicial",
      description: "Aprendé a usar las funciones principales.",
      icon: "guide" as const,
    },
    {
      id: "go-live",
      title: "Puesta en marcha",
      description: "Empezá a gestionar tu operación desde el sistema.",
      icon: "launch" as const,
    },
  ],
  plan: {
    launchStageLabel: "Etapa de lanzamiento",
    name: "Plan Lanzamiento",
    priceLabel: "Precio a consultar",
    billingNote: "Costo inicial de incorporación + abono recurrente.",
    disclaimer: "Plataforma SaaS estándar. No incluye desarrollos ni integraciones a medida.",
    learnMoreLabel: "Conocé aún más",
    learnMoreUrl:
      "https://drive.google.com/file/d/1b5oVGShKFr-CoK-hPKYzPJlfWhRg2fVv/view?usp=sharing",
    /** Características verificables en producto (landing / funcionalidades mostradas). */
    features: [
      "Planificación de servicios, equipos y horarios",
      "Fichaje con ubicación desde WhatsApp",
      "Vista operativa con alertas e incidencias",
    ],
  },
} as const;
