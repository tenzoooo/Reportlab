"use client"

import { Clock, Brain, FileCheck, ArrowRight } from "lucide-react"

const beforeItems = [
  {
    icon: Clock,
    title: "作成時間",
    value: "3〜5時間",
    description: "手入力、グラフ作成、書式調整に膨大な時間",
  },
  {
    icon: Brain,
    title: "作業内容",
    value: "単純作業80%",
    description: "コピペ、表作成、書式統一に追われる",
  },
  {
    icon: FileCheck,
    title: "品質",
    value: "ばらつきあり",
    description: "書き漏らし、書式ミス、数式エラーのリスク",
  },
]

const afterItems = [
  {
    icon: Clock,
    title: "作成時間",
    value: "30分以下",
    description: "AIが自動生成、あなたは確認・修正のみ",
  },
  {
    icon: Brain,
    title: "作業内容",
    value: "考察に集中",
    description: "思考に時間を割ける、本質的な学びへ",
  },
  {
    icon: FileCheck,
    title: "品質",
    value: "均質・正確",
    description: "要件チェック、書式統一、数式の正確性を担保",
  },
]

export default function BeforeAfterSection() {
  return (
    <section className="py-24 px-8 md:px-16 lg:px-24 mincho">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light text-gray-900 mb-4">
            <span className="font-medium italic instrument">Before</span> &{" "}
            <span className="font-medium italic instrument">After</span>
          </h2>
          <p className="text-gray-600 text-sm max-w-md mx-auto">
            ProReportがあなたのレポート作成をどう変えるか
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* BEFORE Block */}
          <div className="p-6 rounded-2xl bg-red-50 border border-red-200 h-full">
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 rounded-full bg-red-100 text-red-600 text-sm font-medium">
                BEFORE
              </span>
              <span className="text-gray-600 text-sm">従来のレポート作成</span>
            </div>
            <div className="space-y-4">
              {beforeItems.map((item) => (
                <div
                  key={item.title}
                  className="p-4 rounded-xl bg-white border border-gray-200 min-h-[100px] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <item.icon className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="text-gray-500 text-xs">{item.title}</span>
                    </div>
                    <p className="text-gray-900 text-lg font-medium">{item.value}</p>
                  </div>
                  <p className="text-gray-500 text-xs line-clamp-2">{item.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Arrow for mobile */}
          <div className="flex md:hidden items-center justify-center">
            <ArrowRight className="w-8 h-8 text-gray-400 rotate-90" />
          </div>

          {/* AFTER Block */}
          <div className="p-6 rounded-2xl bg-green-50 border border-green-200 h-full">
            <div className="flex items-center gap-3 mb-6">
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-600 text-sm font-medium">
                AFTER
              </span>
              <span className="text-gray-600 text-sm">ProReportを使うと</span>
            </div>
            <div className="space-y-4">
              {afterItems.map((item) => (
                <div
                  key={item.title}
                  className="p-4 rounded-xl bg-white border border-gray-200 min-h-[100px] flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <item.icon className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <span className="text-gray-500 text-xs">{item.title}</span>
                    </div>
                    <p className="text-gray-900 text-lg font-medium">{item.value}</p>
                  </div>
                  <p className="text-gray-500 text-xs line-clamp-2">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
