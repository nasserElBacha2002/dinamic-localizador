import { BRAND_LOGO_HORIZONTAL_SRC, BRAND_PRODUCT_NAME } from "../brand/brand-assets";
import { LANDING_SEO } from "./landing-content";

/** Dimensiones reales del PNG en `public/brand/` (480×150). */
export const LANDING_OG_IMAGE = {
  url: `https://dinamicoperations.com${BRAND_LOGO_HORIZONTAL_SRC}`,
  width: 480,
  height: 150,
  alt: `${BRAND_PRODUCT_NAME} — logo`,
} as const;

/** Contacto público documentado en la política de privacidad del sitio. */
export const LANDING_PUBLIC_CONTACT_EMAIL = "info@dinamicoperations.com" as const;

/** Destinos accesibles en HTML inicial (sin depender del montaje React). */
export const LANDING_PRERENDER_ANCHORS = {
  comoFunciona: "como-funciona",
  situaciones: "situaciones",
  solicitarDemo: "solicitar-demo",
  faq: "preguntas-frecuentes",
} as const;

export const LANDING_PRERENDER_FALLBACK = {
  comoFunciona: {
    title: "Cómo funciona",
    body:
      "Dinamic Operations combina planificación de servicios, registro de asistencia por WhatsApp con ubicación y un tablero para detectar desvíos. Con JavaScript activo podés ver el video de demostración en esta misma página.",
  },
  situaciones: {
    title: "Situaciones operativas",
    body: "Ejemplos ilustrativos de cobertura, ausencias y reasignaciones que la plataforma ayuda a gestionar.",
  },
  solicitarDemo: {
    title: "Solicitar una demo",
    body:
      "El formulario interactivo de solicitud está disponible en esta página cuando JavaScript está habilitado. Si no podés usarlo, escribinos a",
    emailSuffix: "según nuestra política de privacidad.",
  },
} as const;

export const LANDING_INTERNAL_LINKS = {
  comoFunciona: "/#como-funciona",
  situaciones: "/#situaciones",
  solicitarDemo: "/#solicitar-demo",
  faq: "/#preguntas-frecuentes",
  limpieza: "/software-empresas-limpieza/",
  privacidad: "/privacidad/",
  login: "/login",
} as const;

/** Descripción extendida del SaaS (hero + prerender). */
export const LANDING_PRODUCT_DESCRIPTION =
  "Dinamic Operations es una plataforma de gestión operativa para empresas que coordinan personal y servicios en múltiples ubicaciones. Centralizá la planificación, el registro de asistencia por WhatsApp y el seguimiento de incidencias desde un mismo sistema." as const;

export const LANDING_PDR_FRAMEWORK = {
  eyebrow: "Planificá · Detectá · Resolvé",
  sectionTitle: "Planificá · Detectá · Resolvé",
  intro:
    "Tres pasos para pasar de coordinar por mensajes sueltos a decidir con el estado operativo frente a vos.",
  pillars: [
    {
      id: "planificar",
      title: "Planificá",
      body: "Definís servicios por ubicación, armás operaciones del día y asignás personas o equipos con horarios. Esa planificación es la referencia del tablero.",
    },
    {
      id: "detectar",
      title: "Detectá",
      body: "Conforme se registran llegadas, salidas y ausencias, el sistema contrasta lo previsto con lo ocurrido y destaca demoras, faltas o cobertura baja en el panel del día.",
    },
    {
      id: "resolver",
      title: "Resolvé",
      body: "Desde la gestión operativa podés validar asistencias (según permisos), revisar el impacto de una ausencia y evaluar reemplazos sugeridos antes de confirmar cambios.",
    },
  ],
} as const;

export const LANDING_FAQ_IDS = {
  whatIs: "what-is",
  whoFor: "who-for",
  whatsappAttendance: "whatsapp-attendance",
  detectAbsence: "detect-absence",
  replacements: "replacements",
  whichSiteAttention: "which-site-attention",
  supervisorInfo: "supervisor-info",
  multiClient: "multi-client",
  reports: "reports",
  requestDemo: "request-demo",
} as const;

export type LandingFaqAnswerLinkSegment = {
  type: "link";
  href: string;
  label: string;
};

export type LandingFaqAnswerTextSegment = {
  type: "text";
  value: string;
};

export type LandingFaqAnswerSegments = ReadonlyArray<LandingFaqAnswerTextSegment | LandingFaqAnswerLinkSegment>;

export type LandingFaqItem = {
  id: (typeof LANDING_FAQ_IDS)[keyof typeof LANDING_FAQ_IDS];
  question: string;
  answer: string | LandingFaqAnswerSegments;
};

export const LANDING_FAQ = {
  sectionTitle: "Preguntas frecuentes",
  sectionId: "preguntas-frecuentes",
  items: [
    {
      id: LANDING_FAQ_IDS.whatIs,
      question: "¿Qué es Dinamic Operations?",
      answer:
        "Es un software en la nube para empresas que prestan servicios con personal en distintas ubicaciones. Centraliza planificación de servicios y equipos, registro de asistencia —incluido un flujo por WhatsApp con ubicación— y seguimiento del día en un tablero operativo.",
    },
    {
      id: LANDING_FAQ_IDS.whoFor,
      question: "¿Para qué empresas está diseñado?",
      answer: [
        {
          type: "text",
          value:
            "Para empresas de limpieza, facility services y servicios tercerizados con equipos en varios clientes o edificios, y para operaciones con múltiples puntos de servicio. Más detalle en ",
        },
        { type: "link", href: LANDING_INTERNAL_LINKS.limpieza, label: "software para empresas de limpieza" },
        { type: "text", value: "." },
      ],
    },
    {
      id: LANDING_FAQ_IDS.whatsappAttendance,
      question: "¿Cómo funciona el control de asistencia por WhatsApp?",
      answer: [
        {
          type: "text",
          value:
            "Planificás operaciones y asignaciones en el sistema. Al llegar, la persona envía el mensaje de llegada por WhatsApp y comparte ubicación; el sistema valida la geocerca del servicio asignado y registra la asistencia. Los supervisores ven el resultado en la app web. Más en ",
        },
        { type: "link", href: LANDING_INTERNAL_LINKS.comoFunciona, label: "Cómo funciona" },
        { type: "text", value: "." },
      ],
    },
    {
      id: LANDING_FAQ_IDS.detectAbsence,
      question: "¿Cómo detecto una ausencia en un servicio?",
      answer:
        "El tablero del día compara quiénes debían presentarse con quiénes registraron llegada. Si falta alguien al inicio o no hay registro dentro de las tolerancias configuradas, la situación queda visible para que el supervisor la priorice.",
    },
    {
      id: LANDING_FAQ_IDS.replacements,
      question: "¿Cómo gestiono el reemplazo de un empleado?",
      answer:
        "Podés revisar el impacto de la falta y consultar sugerencias de personal o equipos; la confirmación de la asignación la realiza quien tenga permisos de gestión de equipos. En empresas con el módulo y la configuración correspondiente, puede haber flujos de solicitud de reemplazo por WhatsApp.",
    },
    {
      id: LANDING_FAQ_IDS.whichSiteAttention,
      question: "¿Cómo identifico qué sede necesita atención?",
      answer:
        "El panel operativo resume el día y destaca servicios con baja cobertura, confirmaciones pendientes, ausencias o demoras según lo configurado en tu empresa, para priorizar dónde actuar.",
    },
    {
      id: LANDING_FAQ_IDS.supervisorInfo,
      question: "¿Qué información puede consultar un supervisor?",
      answer:
        "Según su rol: operaciones del día, asistencia por servicio, incidencias destacadas e informes estadísticos. La exportación de informes requiere permisos explícitos (por ejemplo, roles de administración). Los perfiles de solo lectura consultan datos pero no exportan ni modifican.",
    },
    {
      id: LANDING_FAQ_IDS.multiClient,
      question: "¿Puedo administrar múltiples clientes y sucursales?",
      answer:
        "Sí. Podés registrar clientes comerciales y servicios en cada ubicación; las operaciones y asignaciones se organizan sobre esas ubicaciones dentro de tu empresa en el sistema.",
    },
    {
      id: LANDING_FAQ_IDS.reports,
      question: "¿Qué reportes genera Dinamic Operations?",
      answer:
        "La sección de estadísticas ofrece resúmenes de asistencia, excepciones e incidencias operativas, con exportación para quienes tengan el permiso correspondiente. Los informes automáticos por correo dependen de la configuración del entorno y no forman parte del plan estándar sin activarlos.",
    },
    {
      id: LANDING_FAQ_IDS.requestDemo,
      question: "¿Cómo puedo solicitar una demostración?",
      answer: [
        { type: "text", value: "Usá el formulario " },
        { type: "link", href: LANDING_INTERNAL_LINKS.solicitarDemo, label: "Solicitar una demo" },
        {
          type: "text",
          value: " en esta página (requiere JavaScript). Para el uso de tus datos, consultá la ",
        },
        { type: "link", href: LANDING_INTERNAL_LINKS.privacidad, label: "política de privacidad" },
        { type: "text", value: "." },
      ],
    },
  ] satisfies ReadonlyArray<LandingFaqItem>,
} as const;

export function landingFaqAnswerPlainText(item: LandingFaqItem): string {
  if (typeof item.answer === "string") {
    return item.answer;
  }
  return item.answer.map((segment) => (segment.type === "text" ? segment.value : segment.label)).join("");
}

export function buildHomeJsonLd(): string {
  const graph = [
    {
      "@type": "WebSite",
      "@id": `${LANDING_SEO.canonicalUrl}#website`,
      url: LANDING_SEO.canonicalUrl,
      name: BRAND_PRODUCT_NAME,
      inLanguage: "es-AR",
    },
    {
      "@type": "Organization",
      "@id": `${LANDING_SEO.canonicalUrl}#organization`,
      name: BRAND_PRODUCT_NAME,
      url: LANDING_SEO.canonicalUrl,
      logo: {
        "@type": "ImageObject",
        url: LANDING_OG_IMAGE.url,
        width: LANDING_OG_IMAGE.width,
        height: LANDING_OG_IMAGE.height,
      },
      contactPoint: {
        "@type": "ContactPoint",
        email: LANDING_PUBLIC_CONTACT_EMAIL,
        contactType: "customer support",
        availableLanguage: ["es"],
      },
    },
    {
      "@type": "WebApplication",
      "@id": `${LANDING_SEO.canonicalUrl}#software`,
      name: BRAND_PRODUCT_NAME,
      applicationCategory: "BusinessApplication",
      description: LANDING_SEO.description,
      url: LANDING_SEO.canonicalUrl,
      image: LANDING_OG_IMAGE.url,
      provider: { "@id": `${LANDING_SEO.canonicalUrl}#organization` },
    },
  ];

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  });
}