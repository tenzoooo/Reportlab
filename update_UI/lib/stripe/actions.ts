import { getStripeClient } from "./client"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function createCheckoutSession(priceId: string) {
  const stripe = getStripeClient()
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("User not authenticated")
  }

  // Get or create Stripe Customer ID (simplified for now, ideally stored in DB)
  // For this MVP, we'll let Stripe handle customer creation during checkout 
  // or use email to lookup if we wanted to be more robust.
  // A better approach is to store stripe_customer_id in profiles table.
  // For now, we will pass customer_email to prefill.

  const session = await stripe.checkout.sessions.create({
    customer_email: user.email,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/settings?tab=subscription&success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/settings?tab=subscription&canceled=true`,
    metadata: {
      userId: user.id,
    },
  })

  if (!session.url) {
    throw new Error("Failed to create checkout session")
  }

  redirect(session.url)
}

export async function createCustomerPortalSession() {
  const stripe = getStripeClient()
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("User not authenticated")
  }

  // Find the subscription to get the customer ID
  // In a real app, store stripe_customer_id in profiles. 
  // Here we query the subscriptions table which we populate via webhook.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id") // We actually need customer ID, but our schema didn't store it. 
                  // Let's fetch it from Stripe using the subscription ID if we have it.
                  // Or better, let's assume we can get it from the latest subscription.
    .eq("user_id", user.id)
    .eq("status", "active")
    .single()

  if (!subscription) {
     throw new Error("No active subscription found")
  }

  // Retrieve subscription from Stripe to get customer ID
  const stripeSubscription = await stripe.subscriptions.retrieve(subscription.id)
  const customerId = stripeSubscription.customer as string

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/settings?tab=subscription`,
  })

  redirect(session.url)
}
