import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import type Stripe from "stripe"

// Supabaseサービスロールクライアント（管理者権限）
const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get("stripe-signature")

  if (!signature) {
    return NextResponse.json({ error: "署名がありません" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error("[v0] Webhook署名検証エラー:", err)
    return NextResponse.json({ error: "Webhook署名検証失敗" }, { status: 400 })
  }

  console.log("[v0] Webhookイベント受信:", event.type)

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdate(subscription)
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(subscription)
        break
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaymentSucceeded(invoice)
        break
      }

      default:
        console.log("[v0] 未処理のイベントタイプ:", event.type)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error("[v0] Webhook処理エラー:", err)
    return NextResponse.json({ error: "Webhook処理失敗" }, { status: 500 })
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id
  const productId = session.metadata?.product_id

  if (!userId) {
    console.error("[v0] user_idがメタデータにありません")
    return
  }

  console.log("[v0] チェックアウト完了:", { userId, productId, mode: session.mode })

  if (session.mode === "subscription") {
    // サブスクリプション作成
    const subscriptionId = session.subscription as string
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    await handleSubscriptionUpdate(subscription)
  } else if (session.mode === "payment") {
    // クレジット購入
    await supabaseAdmin.from("credits").upsert(
      {
        user_id: userId,
        balance: supabaseAdmin.rpc("increment_balance", { user_id: userId, amount: 1 }),
        total_purchased: supabaseAdmin.rpc("increment_total", { user_id: userId, amount: 1 }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )

    console.log("[v0] クレジット追加完了:", userId)
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id || (await getUserIdFromCustomer(subscription.customer as string))

  if (!userId) {
    console.error("[v0] ユーザーIDが見つかりません")
    return
  }

  const productId = subscription.items.data[0]?.price.metadata?.product_id || "basic"
  const monthlyLimit = productId === "basic" ? 4 : 1

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      plan_id: productId,
      status: subscription.status,
      monthly_limit: monthlyLimit,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  )

  console.log("[v0] サブスクリプション更新完了:", { userId, status: subscription.status })
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.user_id || (await getUserIdFromCustomer(subscription.customer as string))

  if (!userId) {
    console.error("[v0] ユーザーIDが見つかりません")
    return
  }

  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "canceled",
      plan_id: "free",
      monthly_limit: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)

  console.log("[v0] サブスクリプションキャンセル完了:", userId)
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string
  if (!subscriptionId) return

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  await handleSubscriptionUpdate(subscription)
}

async function getUserIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single()

  return data?.user_id || null
}
