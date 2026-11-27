import {
  CLEANING_LANDING_FAQ,
  CLEANING_LANDING_INTERNAL_LINKS,
  CLEANING_LANDING_PROBLEMS,
  CLEANING_LANDING_TEAM_WORKFLOW,
  CLEANING_LANDING_TEAM_WORKFLOW_CLOSING,
  cleaningFaqAnswerPlainText,
  type CleaningFaqAnswerSegments,
  type CleaningFaqItem,
} from "./cleaning-landing-content";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderCleaningProblemItemsHtml(): string {
  return CLEANING_LANDING_PROBLEMS.items
    .map(
      (item) => `    <article>
      <h3>${escapeHtml(item.title)}</h3>
      <p><strong>El desafío:</strong> ${escapeHtml(item.problem)}</p>
      <p><strong>Cómo ayuda Dinamic Operations:</strong> ${escapeHtml(item.solution)}</p>
      <p><strong>Beneficio operativo:</strong> ${escapeHtml(item.benefit)}</p>
    </article>`,
    )
    .join("\n");
}

export function renderCleaningTeamWorkflowHtml(): string {
  const paragraphs = CLEANING_LANDING_TEAM_WORKFLOW.paragraphs
    .map((paragraph) => `    <p>${escapeHtml(paragraph)}</p>`)
    .join("\n");
  const closing = renderCleaningTeamWorkflowClosingHtml();
  return `${paragraphs}\n${closing}`;
}

export function renderCleaningTeamWorkflowClosingHtml(): string {
  const c = CLEANING_LANDING_TEAM_WORKFLOW_CLOSING;
  return `    <p>${escapeHtml(c.beforeComoFunciona)}<a href="${escapeHtml(CLEANING_LANDING_INTERNAL_LINKS.comoFunciona)}">${escapeHtml(c.comoFuncionaLabel)}</a>${escapeHtml(c.betweenLinks)}<a href="${escapeHtml(CLEANING_LANDING_INTERNAL_LINKS.situaciones)}">${escapeHtml(c.situacionesLabel)}</a>${escapeHtml(c.afterSituaciones)}</p>`;
}

function renderFaqAnswerHtml(item: CleaningFaqItem): string {
  if (typeof item.answer === "string") {
    return escapeHtml(item.answer);
  }
  return renderFaqSegmentsHtml(item.answer);
}

function renderFaqSegmentsHtml(segments: CleaningFaqAnswerSegments): string {
  return segments
    .map((segment) =>
      segment.type === "text"
        ? escapeHtml(segment.value)
        : `<a href="${escapeHtml(segment.href)}">${escapeHtml(segment.label)}</a>`,
    )
    .join("");
}

export function renderCleaningFaqHtml(): string {
  return CLEANING_LANDING_FAQ.items
    .map(
      (item) => `    <div data-faq-id="${escapeHtml(item.id)}">
      <h3>${escapeHtml(item.question)}</h3>
      <p>${renderFaqAnswerHtml(item)}</p>
    </div>`,
    )
    .join("\n");
}

/** Mapa id → texto de respuesta para pruebas de paridad / reorden. */
export function cleaningFaqAnswerById(): Record<string, string> {
  return Object.fromEntries(CLEANING_LANDING_FAQ.items.map((item) => [item.id, cleaningFaqAnswerPlainText(item)]));
}