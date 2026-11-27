import type { ReactNode } from "react";
import { LANDING_FAQ, type LandingFaqItem } from "../content/landing-editorial";
import shared from "../styles/landing-shared.module.css";
import classes from "./sections.module.css";

function LandingFaqAnswer({ item }: { item: LandingFaqItem }) {
  if (typeof item.answer === "string") {
    return <>{item.answer}</>;
  }
  const nodes: ReactNode[] = item.answer.map((segment, index) => {
    if (segment.type === "text") {
      return segment.value;
    }
    return (
      <a key={`${item.id}-link-${index}`} href={segment.href}>
        {segment.label}
      </a>
    );
  });
  return <>{nodes}</>;
}

export function HomeFaqSection() {
  return (
    <section
      id={LANDING_FAQ.sectionId}
      className={`${shared.section} ${classes.faqSection}`}
      aria-labelledby="home-faq-title"
    >
      <div className={shared.sectionInner}>
        <h2 id="home-faq-title" className={shared.title}>
          {LANDING_FAQ.sectionTitle}
        </h2>
        <div className={classes.faqList}>
          {LANDING_FAQ.items.map((item) => (
            <details key={item.id} className={classes.faqItem} data-faq-id={item.id}>
              <summary className={classes.faqQuestion}>
                <span>{item.question}</span>
              </summary>
              <div className={classes.faqAnswer}>
                <p>
                  <LandingFaqAnswer item={item} />
                </p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}