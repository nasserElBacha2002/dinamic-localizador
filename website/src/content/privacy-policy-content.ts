export const PRIVACY_POLICY_SEO = {
  title: "Política de privacidad | Dinamic Operations",
  description:
    "Cómo Dinamic Operations usa los datos que dejás al pedir una demo: responsable, finalidad, conservación y tus derechos (Ley 25.326).",
  canonicalUrl: "https://dinamicoperations.com/privacidad/",
  pathname: "/privacidad/",
} as const;

/** Garantía de cesión/uso comercial compartida (sitio web y LinkedIn). */
export const PRIVACY_COMMERCIAL_DATA_GUARANTEE =
  "No vendemos tus datos personales, no los cedemos a terceros con fines comerciales y no los utilizamos para enviarte publicidad sin tu consentimiento." as const;

export const PRIVACY_POLICY = {
  heading: "Política de Privacidad — Dinamic Operations",
  updated: "Última actualización: 27 de noviembre de 2026",
  sections: [
    {
      title: "1. Responsable",
      body: "El responsable de los datos es Nasser El Bacha, CUIT 20-44159827-1, con domicilio en Formosa 456, Argentina. Para cualquier consulta sobre datos personales podés escribir a info@dinamicoperations.com.",
    },
    {
      title: "2. Qué datos recolectamos",
      body: "Dinamic Operations recibe datos personales cuando completás el formulario de contacto de dinamicoperations.com o un formulario de generación de contactos de LinkedIn Ads. Formulario del sitio: nombre y apellido, empresa, email laboral y cantidad de empleados; de forma opcional, teléfono o WhatsApp y una descripción de tus servicios o ubicaciones. Formularios de LinkedIn Ads: nombre, apellido y email laboral. Además, nuestro servidor registra datos técnicos como dirección IP, fecha, URL visitada y navegador.",
    },
    {
      title: "3. Para qué los usamos",
      body: "Usamos tus datos exclusivamente para responder consultas, brindar información sobre Dinamic Operations, coordinar demostraciones y realizar el seguimiento comercial relacionado con la solicitud recibida, tanto si llega por el sitio como por LinkedIn. No te suscribimos automáticamente a newsletters ni autorizamos campañas comerciales ajenas a tu consulta. " +
        PRIVACY_COMMERCIAL_DATA_GUARANTEE +
        " Los datos técnicos del sitio se usan por seguridad y para prevenir spam.",
    },
    {
      title: "4. Dónde se guardan y quién accede",
      body: "Formulario del sitio: tu solicitud llega como un correo a nuestra casilla comercial, alojada en Hostinger (servidores en la Unión Europea), y se reenvía a una casilla interna del responsable. No la cargamos en bases de datos de contactos, planillas ni CRM. Solo accede Nasser El Bacha, responsable de Dinamic Operations. Formularios de LinkedIn: los datos se envían a través de LinkedIn; los consultamos y gestionamos únicamente desde el panel de gestión de leads de la plataforma. No los reenviamos automáticamente al correo de Hostinger, no los exportamos a archivos y no los cargamos en CRM, planillas u otros sistemas. Solo accede Nasser El Bacha, responsable de Dinamic Operations, dentro de ese panel. El sitio está alojado en un servidor de Haulmer (ZAM Ltda.) en Chile.",
    },
    {
      title: "5. Proveedores",
      body: "Sitio web y formulario de demo: Haulmer (ZAM Ltda., Chile) para el hosting; Hostinger para correo y DNS (UE); Let's Encrypt para el certificado HTTPS (EE. UU.). Formularios de LinkedIn: la plataforma LinkedIn recibe y aloja los datos del formulario de generación de contactos; Dinamic Operations accede a esos leads solo en el panel que LinkedIn ofrece al anunciante. Cada proveedor trata los datos según su propia política de privacidad.",
    },
    {
      title: "6. Cookies",
      body: "El sitio no usa cookies, Google Analytics ni píxeles de publicidad. Si en el futuro incorporamos herramientas de medición (por ejemplo, LinkedIn Insight Tag), vamos a actualizar esta política antes de hacerlo.",
    },
    {
      title: "7. Cuánto tiempo los guardamos",
      body: "Las consultas que no avanzan comercialmente —del sitio o gestionadas por Dinamic Operations en el panel de LinkedIn— se eliminan a los 12 meses. Si te convertís en cliente, conservamos tus datos mientras dure la relación comercial. Las IP usadas contra el spam se borran en minutos y los registros de acceso al sitio se borran a los 14 días. LinkedIn puede conservar datos según sus propias políticas en la plataforma; eso queda fuera del control de Dinamic Operations y no lo garantizamos nosotros.",
    },
    {
      title: "8. Tus derechos",
      body: "Podés pedir acceso, rectificación, actualización o supresión de tus datos —incluidos los obtenidos mediante formularios de LinkedIn Ads— escribiendo a info@dinamicoperations.com. Para proteger tu información, respondemos solo al mismo email desde el que se hace la solicitud. Respondemos dentro de los 10 días corridos (acceso) y 5 días hábiles (rectificación o supresión), según la Ley 25.326. La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.",
    },
    {
      title: "9. Cambios",
      body: "Si modificamos esta política, vamos a publicar la nueva versión en esta página con su fecha de actualización.",
    },
  ],
} as const;

export const DEMO_FORM_PRIVACY_NOTICE =
  "Al enviar el formulario aceptás que usemos tus datos para contactarte por la demo. Más info en nuestra Política de privacidad.";