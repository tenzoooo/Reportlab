"use server"

import { stripe } from "@/lib/stripe"
import { PRODUCTS } from "@/lib/products"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function startCheckoutSession(productId: string) {
  const product = PRODUCTS.find((p) => p.id === productId)
  if (!product) {
    throw new Error(`製品ID "${productId}" が見つかりません`)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("認証が必要です")
  }

  // Stripe顧客IDを取得または作成
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single()

  let customerId = subscription?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        supabase_user_id: user.id,
      },
    })
    customerId = customer.id

    await supabase.from("subscriptions").update({ stripe_customer_id: customerId }).eq("user_id", user.id)
  }

  // チェックアウトセッション作成
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    ui_mode: "embedded",
    redirect_on_completion: "never",
    line_items: [
      {
        price_data: {
          currency: "jpy",
          product_data: {
            name: product.name,
            description: product.description,
          },
          unit_amount: product.priceInCents,
          ...(product.type === "subscription" && product.interval
            ? {
                recurring: {
                  interval: product.interval,
                },
              }
            : {}),
        },
        quantity: 1,
      },
    ],
    mode: product.type === "subscription" ? "subscription" : "payment",
    metadata: {
      product_id: productId,
      user_id: user.id,
    },
  })

  return session.client_secret
}

export async function cancelSubscription() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("認証が必要です")
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .single()

  if (!subscription?.stripe_subscription_id) {
    throw new Error("サブスクリプションが見つかりません")
  }

  await stripe.subscriptions.cancel(subscription.stripe_subscription_id)

  await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)

  redirect("/billing")
}
