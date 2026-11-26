import { useEffect } from "react";
import { MarketingFooter } from "../components/MarketingFooter";
import { MarketingHeader } from "../components/MarketingHeader";
import { PRIVACY_POLICY, PRIVACY_POLICY_SEO } from "../content/privacy-policy-content";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import classes from "./privacy-policy.module.css";

export function PrivacyPolicyPage() {
  useDocumentMeta(PRIVACY_POLICY_SEO);

  useEffect(() => {
    document.getElementById("privacy-seo-prerender")?.remove();
  }, []);

  return (
    <div className={`marketing-root ${classes.page}`}>
      <MarketingHeader marketingRoot="/" demoHref="/#solicitar-demo" />
      <main>
        <article className={classes.article}>
          <h1>{PRIVACY_POLICY.heading}</h1>
          <p className={classes.updated}>{PRIVACY_POLICY.updated}</p>
          {PRIVACY_POLICY.sections.map((section, index) => {
            const headingId = `privacy-section-${index + 1}`;
            return (
              <section key={section.title} aria-labelledby={headingId}>
                <h2 id={headingId}>{section.title}</h2>
                <p>{section.body}</p>
              </section>
            );
          })}
        </article>
      </main>
      <MarketingFooter marketingRoot="/" demoHref="/#solicitar-demo" />
    </div>
  );
}
