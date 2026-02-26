"use client"

import { ArrowRight } from "lucide-react"
import GlassButton from "./glass-button"

export default function CtaSection() {
  return (
    <section className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="p-10 md:p-16 text-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
              <span className="font-medium italic instrument">今すぐ</span>始めよう
            </h2>
            <p className="text-gray-600 text-sm md:text-base max-w-lg mx-auto mb-8 leading-relaxed">
              7日間の無料トライアルで、Reportlabの全機能をお試しください。
              <br className="hidden md:block" />
              クレジットカード登録不要で、すぐに始められます。
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <GlassButton variant="filled" className="py-4 group whitespace-nowrap" href="/register">
                <span className="inline-flex items-center gap-2">
                  無料で始める
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </span>
              </GlassButton>
              <GlassButton variant="outline" href="#pricing" className="py-4">
                料金プランを見る
              </GlassButton>
            </div>

            <p className="text-gray-500 text-xs mt-6">
              登録は30秒で完了 ・ いつでもキャンセル可能
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}