import { getStripeClient } from "@/lib/stripe/client"
import { createClient } from "@supabase/supabase-js"
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import Stripe from "stripe"

export async function POST(req: Request) {
  const body = await req.text()
  const signature = (await headers()).get("Stripe-Signature") as string
  console.log("[WEBHOOK] Received webhook")

  const stripe = getStripeClient()
  let event: Stripe.Event

  const secret = process.env.STRIPE_WEBHOOK_SECRET!
  console.log("***** [WEBHOOK] STARTING *****")
  console.log("***** [WEBHOOK] Secret length:", secret?.length)
  console.log("***** [WEBHOOK] Secret first 5 chars:", secret?.substring(0, 5))

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      secret
    )
  } catch (error: any) {
    console.error("[WEBHOOK] Signature verification failed:", error.message)
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 })
  }
  console.log("[WEBHOOK] Event type:", event.type)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[WEBHOOK] Missing Supabase environment variables")
    return new NextResponse("Internal Server Error: Missing Supabase Config", { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        console.log("[WEBHOOK] Processing checkout.session.completed")
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabaseUserId || session.metadata?.userId
        const subscriptionId = session.subscription as string

        console.log("[WEBHOOK] Session ID:", session.id)
        console.log("[WEBHOOK] Mode:", session.mode)
        console.log("[WEBHOOK] Subscription ID:", subscriptionId)
        console.log("[WEBHOOK] User ID from metadata:", userId)

        if (!userId) {
          console.error("[WEBHOOK] Missing userId in metadata")
          break
        }

        // One-time credit purchase (mode=payment)
        if (session.mode === "payment") {
          const creditsPurchased = Number(session.metadata?.creditsPurchased ?? NaN)
          if (!Number.isFinite(creditsPurchased) || creditsPurchased <= 0) {
            console.error("[WEBHOOK] Invalid creditsPurchased metadata:", session.metadata?.creditsPurchased)
            break
          }

          const description = `Stripe checkout (${session.id})`
          const { data: existing } = await supabase
            .from("credit_transactions")
            .select("id")
            .eq("user_id", userId)
            .eq("description", description)
            .maybeSingle()

          if (existing) {
            console.log("[WEBHOOK] Credit transaction already recorded, skipping duplicate:", existing.id)
            break
          }

          console.log("[WEBHOOK] Adding credits:", creditsPurchased, "to user:", userId)
          await supabase.rpc("increment_credits", {
            user_id_arg: userId,
            amount_arg: creditsPurchased,
          })

          await supabase.from("credit_transactions").insert({
            user_id: userId,
            amount: creditsPurchased,
            description,
          })

          break
        }

        if (!subscriptionId) {
          console.error("[WEBHOOK] Missing subscriptionId for subscription checkout")
          break
        }

        // Retrieve subscription to get status and price
        const subscription = await stripe.subscriptions.retrieve(subscriptionId)

        // Determine plan name
        const priceId = subscription.items.data[0].price.id
        const premiumPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM
        const creditsPriceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_CREDITS

        console.log("[WEBHOOK] Received Price ID:", priceId)
        console.log("[WEBHOOK] Expected Premium ID:", premiumPriceId)
        console.log("[WEBHOOK] Expected Credits ID:", creditsPriceId)

        let planName = 'free'
        if (priceId === premiumPriceId) {
          planName = 'premium'
        } else if (priceId === creditsPriceId) {
          planName = 'credit_only'
        }
        console.log("[WEBHOOK] Determined Plan Name:", planName)

        // Update profiles table
        console.log("[WEBHOOK] Updating profile plan to:", planName, "for user:", userId)
        const { error: profileError, count: profileCount } = await supabase
          .from("profiles")
          .update({ plan: planName })
          .eq("id", userId)
          .select() // Select to get the count/data back if needed, though count option is better

        if (profileError) {
          console.error("[WEBHOOK] Profile update failed:", profileError)
        } else {
          console.log("[WEBHOOK] Profile update success. Rows affected:", profileCount) // Note: count might be null without count option
        }

        // Insert into subscriptions table
        console.log("[WEBHOOK] Upserting subscription:", subscriptionId, "for user:", userId)
        const { error: upsertError } = await supabase.from("subscriptions").upsert({
          id: subscriptionId,
          user_id: userId,
          status: subscription.status,
          price_id: priceId,
          cancel_at_period_end: subscription.cancel_at_period_end,
        })
        if (upsertError) {
          console.error("[WEBHOOK] Subscription upsert failed:", upsertError)
        } else {
          console.log("[WEBHOOK] Subscription upsert success")
        }

        // Add credits if applicable (e.g. 400 credits for specific plans)
        // You might want to check price_id to decide how many credits to add
        // For now, let's assume all subscriptions give 400 credits on creation
        // In a real app, map price_id to credit amount
        const creditsToAdd = 400

        await supabase.rpc("increment_credits", {
          user_id_arg: userId,
          amount_arg: creditsToAdd
        })

        // Log transaction
        await supabase.from("credit_transactions").insert({
          user_id: userId,
          amount: creditsToAdd,
          description: "Subscription started - Monthly credits",
        })

        break
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice
        const subscriptionId = invoice.subscription as string

        // If this is the first payment (billing_reason='subscription_create'), 
        // it's already handled by checkout.session.completed usually, 
        // BUT checkout.session.completed is better for initial setup.
        // invoice.payment_succeeded is good for recurring renewals.

        if (invoice.billing_reason === 'subscription_cycle') {
          // Find user by subscriptionId
          const { data: sub } = await supabase
            .from("subscriptions")
            .select("user_id")
            .eq("id", subscriptionId)
            .single()

          if (sub) {
            const creditsToAdd = 400
            await supabase.rpc("increment_credits", {
              user_id_arg: sub.user_id,
              amount_arg: creditsToAdd
            })

            await supabase.from("credit_transactions").insert({
              user_id: sub.user_id,
              amount: creditsToAdd,
              description: "Subscription renewal - Monthly credits",
            })
          }
        }
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        const priceId = subscription.items.data[0].price.id
        let planName = 'free'
        if (subscription.status === 'active') {
          if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_PREMIUM) {
            planName = 'premium'
          } else if (priceId === process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_CREDITS) {
            planName = 'credit_only'
          }
        }

        await supabase.from("subscriptions").update({
          status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end,
        }).eq("id", subscription.id)

        // Find user_id from subscription to update profile
        const { data: sub } = await supabase.from("subscriptions").select("user_id").eq("id", subscription.id).single()
        if (sub) {
          await supabase.from("profiles").update({ plan: planName }).eq("id", sub.user_id)
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        await supabase.from("subscriptions").update({
          status: subscription.status,
        }).eq("id", subscription.id)

        const { data: sub } = await supabase.from("subscriptions").select("user_id").eq("id", subscription.id).single()
        if (sub) {
          await supabase.from("profiles").update({ plan: 'free' }).eq("id", sub.user_id)
        }
        break
      }
    }
  } catch (error) {
    console.error("[STRIPE_WEBHOOK]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }

  return new NextResponse(null, { status: 200 })
}
