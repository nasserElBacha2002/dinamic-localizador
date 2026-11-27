import { useEffect } from "react";
import { MarketingFooter } from "../components/MarketingFooter";
import { MarketingHeader } from "../components/MarketingHeader";
import { useLandingDocumentMeta } from "../hooks/useLandingDocumentMeta";
import { CommercialSection } from "../sections/CommercialSection";
import { DemoSection } from "../sections/DemoSection";
import { HeroSection } from "../sections/HeroSection";
import { HomeFaqSection } from "../sections/HomeFaqSection";
import { OperationsTodaySection } from "../sections/OperationsTodaySection";
import { SituationsCarousel } from "../sections/SituationsCarousel";
import { VideoSection } from "../sections/VideoSection";
import { WhatsAppSection } from "../sections/WhatsAppSection";
import { LANDING_OG_IMAGE } from "../content/landing-editorial";

export function LandingPage() {
  useLandingDocumentMeta({
    ogImage: LANDING_OG_IMAGE.url,
    ogImageAlt: LANDING_OG_IMAGE.alt,
  });

  useEffect(() => {
    document.getElementById("home-seo-prerender")?.remove();
  }, []);

  return (
    <div className="marketing-root">
      <MarketingHeader />
      <main>
        <HeroSection />
        <VideoSection />
        <WhatsAppSection />
        <CommercialSection />
        <SituationsCarousel />
        <OperationsTodaySection />
        <HomeFaqSection />
        <DemoSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
