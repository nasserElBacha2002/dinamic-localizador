import type { ReactNode } from "react";
import { SectionCard } from "../components/SectionCard";

export interface FormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

export function FormSection({ title, description, children, actions }: FormSectionProps) {
  return (
    <SectionCard title={title} description={description} action={actions}>
      {children}
    </SectionCard>
  );
}
