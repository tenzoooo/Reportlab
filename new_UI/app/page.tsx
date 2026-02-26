"use client"

import BeforeAfterSection from "@/components/before-after-section"
import CtaSection from "@/components/cta-section"
import FeaturesSection from "@/components/features-section"
import Footer from "@/components/footer"
import Header from "@/components/header"
import HeroContent from "@/components/hero-content"
import PricingSection from "@/components/pricing-section"
import ShaderBackground from "@/components/shader-background"

export default function ShaderShowcase() {
  return (
    <ShaderBackground>
      {/* Hero Section with fixed height */}
      <div className="relative min-h-screen">
        <Header />
        <HeroContent />
      </div>
      {/* Content Sections */}
      <FeaturesSection />
      <PricingSection />
      <BeforeAfterSection />
      <CtaSection />
      <Footer />
    </ShaderBackground>
  )
}
