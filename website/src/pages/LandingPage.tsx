import { MarketingFooter } from "../components/MarketingFooter";
import { MarketingHeader } from "../components/MarketingHeader";
import { useLandingDocumentMeta } from "../hooks/useLandingDocumentMeta";
import { DemoSection } from "../sections/DemoSection";
import { HeroSection } from "../sections/HeroSection";
import { OperationsTodaySection } from "../sections/OperationsTodaySection";
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
        <VideoSection />
        <WhatsAppSection />
        <SituationsCarousel />
        <OperationsTodaySection />
        <DemoSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
