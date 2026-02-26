"use client"

import GlassButton from "./glass-button"

export default function HeroContent() {
  return (
    <main className="absolute bottom-8 left-8 z-20 max-w-xl">
      <div className="text-left">
        {/* Main Heading */}
        <h1 className="text-5xl md:text-6xl md:leading-16 tracking-tight font-light text-gray-900 mb-4">
          <span className="font-medium italic instrument">美しい</span>レポートを
          <br />
          <span className="font-light tracking-tight text-gray-900">最速で提出できる形に</span>
        </h1>

        {/* Description */}
        <p className="text-sm font-light text-gray-600 mb-6 leading-relaxed max-w-md">
          PDF・Excelを取り込むだけで章構造を自動生成。
          <br />
          表や図の挿入も、考察のヒントもAIがサポートします。
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-4 flex-wrap">
          <GlassButton variant="outline" href="#pricing">
            Pricing
          </GlassButton>
          <GlassButton variant="filled">
            Get Started
          </GlassButton>
        </div>
      </div>
    </main>
  )
}
