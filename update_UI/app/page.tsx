"use client"

import dynamic from "next/dynamic"
import Footer from "@/components/footer"
import Header from "@/components/header"
import HeroContent from "@/components/hero-content"
import ShaderBackground from "@/components/shader-background"
import CircularStamp from "@/components/circular-stamp"

// 遅延読み込み
const CoverFlowCarousel = dynamic(() => import("@/components/cover-flow-carousel"), {
  ssr: false,
  loading: () => <div className="h-[900px] w-full" />,
})
const TediousTasksSlider = dynamic(() => import("@/components/tedious-tasks-slider"), { ssr: false })
const PricingSection = dynamic(() => import("@/components/pricing-section"), { ssr: false })
const CtaSection = dynamic(() => import("@/components/cta-section"), { ssr: false })

export default function Home() {
  return (
    <ShaderBackground>
      {/* Hero Section with fixed height */}
      <div className="relative min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 relative">
          <HeroContent />
          <CircularStamp />
        </div>
      </div>
      
      {/* Content Sections - Lazy Loaded */}
      <CoverFlowCarousel />
      <TediousTasksSlider />
      <PricingSection />
      <CtaSection />
      <Footer />
    </ShaderBackground>
  )
}
