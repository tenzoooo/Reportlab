"use client"

import { Flag as Flask, Cpu, Leaf, Zap } from "lucide-react"

const templates = [
  {
    icon: Flask,
    name: "化学実験レポート",
    description: "滴定・分析実験に最適化されたテンプレート",
  },
  {
    icon: Cpu,
    name: "物理学レポート",
    description: "測定誤差や単位換算をサポート",
  },
  {
    icon: Leaf,
    name: "生物学レポート",
    description: "観察記録や統計処理に対応",
  },
  {
    icon: Zap,
    name: "工学実験レポート",
    description: "回路図や設計図の挿入をサポート",
  },
]

export default function TemplatesSection() {
  return (
    <section id="templates" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light text-white mb-4">
            すぐに使える<span className="font-medium italic instrument">テンプレート</span>
          </h2>
          <p className="text-white/60 text-sm max-w-md mx-auto">
            各分野に特化したテンプレートで、レポート作成をさらに効率化
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {templates.map((template) => (
            <div
              key={template.name}
              className="p-5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-3 group-hover:bg-white/20 transition-all duration-300">
                <template.icon className="w-5 h-5 text-white/80" />
              </div>
              <h3 className="text-white text-sm font-medium mb-1">{template.name}</h3>
              <p className="text-white/50 text-xs leading-relaxed">{template.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-white/40 text-xs">
            その他にも多数のテンプレートを用意しています
          </p>
        </div>
      </div>
    </section>
  )
}
