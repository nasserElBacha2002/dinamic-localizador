import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderPage(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, options);
}
