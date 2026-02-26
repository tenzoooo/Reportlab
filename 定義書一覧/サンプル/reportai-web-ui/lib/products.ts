export interface Product {
  id: string
  name: string
  description: string
  priceInCents: number
  monthlyLimit: number
  features: string[]
  type: "subscription" | "credit"
  interval?: "month"
}

// 製品カタログ（価格の信頼できる情報源）
export const PRODUCTS: Product[] = [
  {
    id: "free",
    name: "Free プラン",
    description: "無料で始める",
    priceInCents: 0,
    monthlyLimit: 1,
    type: "subscription",
    features: ["月1件まで実行可能", "基本的な要約・OCR機能", "DOCXテンプレート出力"],
  },
  {
    id: "basic",
    name: "ベーシックプラン",
    description: "研究活動に最適",
    priceInCents: 90000, // ¥900
    monthlyLimit: 4,
    type: "subscription",
    interval: "month",
    features: ["月4件まで実行可能", "高度な要約・OCR機能", "DOCXテンプレート出力", "優先サポート"],
  },
  {
    id: "credit-1",
    name: "追加クレジット",
    description: "1クレジット = 1レポート生成",
    priceInCents: 30000, // ¥300
    monthlyLimit: 0,
    type: "credit",
    features: ["有効期限なし", "月間上限に関係なく使用可能", "すべての機能が利用可能"],
  },
]

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id)
}

export function getSubscriptionPlans(): Product[] {
  return PRODUCTS.filter((p) => p.type === "subscription")
}

export function getCreditProducts(): Product[] {
  return PRODUCTS.filter((p) => p.type === "credit")
}
