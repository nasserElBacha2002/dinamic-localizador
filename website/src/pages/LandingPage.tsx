import { MarketingFooter } from "../components/MarketingFooter";
import { MarketingHeader } from "../components/MarketingHeader";
import { useLandingDocumentMeta } from "../hooks/useLandingDocumentMeta";
import { AudienceSection } from "../sections/AudienceSection";
import { DemoSection } from "../sections/DemoSection";
import { FinalCtaSection } from "../sections/FinalCtaSection";
import { HeroSection } from "../sections/HeroSection";
import { ProblemSection } from "../sections/ProblemSection";
import { ProductExperienceSection } from "../sections/product-experience/ProductExperienceSection";
import { SituationsCarousel } from "../sections/SituationsCarousel";
import { VideoSection } from "../sections/VideoSection";
import { WhatsAppSection } from "../sections/WhatsAppSection";

export function LandingPage() {
  useLandingDocumentMeta();

  return (
    <div className="marketing-root">
      <MarketingHeader />
      <main>
        <HeroSection />
        <ProblemSection />
        <VideoSection />
        <ProductExperienceSection />
        <WhatsAppSection />
        <SituationsCarousel />
        <AudienceSection />
        <FinalCtaSection />
        <DemoSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
