import { getSubscriptionStatus } from "@/lib/subscription"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Coins, Plus } from "lucide-react"

export async function CreditBalance() {
  const status = await getSubscriptionStatus()

  if (!status) return null

  return (
    <Card className="border-green-200 bg-gradient-to-br from-green-50 to-teal-50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-full">
              <Coins className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">クレジット残高</p>
              <p className="text-2xl font-bold text-green-600">{status.credit_balance}</p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="border-green-300 hover:bg-green-50 bg-transparent">
            <Link href="/credits">
              <Plus className="h-4 w-4 mr-1" />
              購入
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
