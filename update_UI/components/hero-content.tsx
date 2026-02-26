"use client"

import GlassButton from "./glass-button"

export default function HeroContent() {
  return (
    <main className="absolute top-12 left-8 z-20 max-w-2xl">
      <div className="text-left">
        {/* Main Heading - Updated to font-bold */}
        <h1 className="text-5xl md:text-6xl md:leading-tight tracking-tight font-bold text-gray-900 mb-4">
          <span className="block whitespace-nowrap">
            <span className="italic instrument">美しい</span>レポートを
          </span>
          <span className="block whitespace-nowrap text-gray-900">
            最速で提出できる形に
          </span>
        </h1>

        {/* Description */}
        <p className="text-sm font-light text-gray-600 mb-6 leading-relaxed max-w-md">
          PDF・Excelを取り込むだけで章構造を自動生成。
          <br />
          表や図の挿入も、考察のヒントもAIがサポートします。
        </p>

        {/* Buttons - Labels translated to Japanese */}
        <div className="flex items-center gap-4 flex-wrap">
          <GlassButton variant="outline" href="#pricing">
            料金プラン
          </GlassButton>
          <GlassButton variant="filled" href="/register">
            今すぐ始める
          </GlassButton>
        </div>
      </div>
    </main>
  )
}