import { Badge } from "@/components/ui/badge"
import type { Subscription } from "@/lib/types"

interface SubscriptionBadgeProps {
  subscription: Subscription
}

export function SubscriptionBadge({ subscription }: SubscriptionBadgeProps) {
  const planNames: Record<string, string> = {
    free: "Free",
    basic: "ベーシック",
  }

  const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
    active: "default",
    canceled: "secondary",
    past_due: "destructive",
  }

  return (
    <Badge variant={statusColors[subscription.status]}>{planNames[subscription.plan_id] || subscription.plan_id}</Badge>
  )
}
