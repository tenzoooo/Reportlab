import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getStripeClient } from "@/lib/stripe/client"
import { logError, logRequest } from "@/lib/server/logger"
import { z } from "zod"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CREDIT_PRICE_ID =
  process.env.STRIPE_PRICE_ID_CREDIT_PACK ??
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_CREDIT_PACK
const CREDITS_PER_UNIT = Number(process.env.CREDITS_PER_UNIT ?? "100")

export async function POST(request: NextRequest) {
  logRequest(request, "stripe:create-checkout-session")

  if (!CREDIT_PRICE_ID || Number.isNaN(CREDITS_PER_UNIT) || CREDITS_PER_UNIT <= 0) {
    return NextResponse.json(
      { error: "Stripe credit pack is not configured. Set STRIPE_PRICE_ID_CREDIT_PACK to a one-time Price ID." },
      { status: 500 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const parsed = z
    .object({
      quantity: z.number().int().min(1).max(20).optional(),
    })
    .safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const quantity = parsed.data.quantity ?? 1
  const creditsPurchased = CREDITS_PER_UNIT * quantity

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const stripe = getStripeClient()
  const origin = request.headers.get("origin") ?? new URL(request.url).origin
  const successUrl = process.env.STRIPE_SUCCESS_URL ?? `${origin}/dashboard/settings?tab=subscription&success=credits`
  const cancelUrl = process.env.STRIPE_CANCEL_URL ?? `${origin}/dashboard/settings?tab=subscription&canceled=credits`

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: CREDIT_PRICE_ID,
          quantity,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // 単発クレジット購入では customer_email のみを使い、
      // Supabase 側の user.id と metadata の紐付けで管理します。
      customer_email: user.email ?? undefined,
      metadata: {
        supabaseUserId: user.id,
        userId: user.id,
        creditsPurchased: String(creditsPurchased),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    logError("stripe:create-checkout-session", err)
    const message = err instanceof Error ? err.message : "Failed to create checkout session"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
