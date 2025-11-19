import { NextRequest, NextResponse } from "next/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { getStripeClient } from "@/lib/stripe/client"
import { logError, logInfo, logRequest } from "@/lib/server/logger"
import { randomUUID } from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const getAdminClient = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured")
  }
  return createAdminClient(supabaseUrl, serviceRoleKey)
}

const mergeUserMetadata = async (userId: string, updates: Record<string, unknown>) => {
  const admin = getAdminClient()
  const { data: userData, error: fetchError } = await admin.auth.admin.getUserById(userId)
  if (fetchError || !userData?.user) {
    throw fetchError ?? new Error("Target user not found")
  }

  const currentMetadata = userData.user.user_metadata ?? {}
  const mergedMetadata = { ...currentMetadata, ...updates }
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: mergedMetadata,
  })

  if (updateError) {
    throw updateError
  }
}

const upsertStripeCustomer = async (admin: ReturnType<typeof createAdminClient>, userId: string, customerId: string) => {
  const { error } = await admin
    .from("stripe_customers")
    .upsert({ user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) {
    throw error
  }
}

const upsertPublicUserStripeCustomer = async (admin: ReturnType<typeof createAdminClient>, userId: string, customerId: string) => {
  const { data, error: fetchError } = await admin.auth.admin.getUserById(userId)
  if (fetchError || !data?.user) {
    throw fetchError ?? new Error("Target user not found for public.users upsert")
  }

  const email = data.user.email
  if (!email) {
    throw new Error("Missing email for public.users upsert")
  }

  const { error } = await admin
    .from("users")
    .upsert({ id: userId, email, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "id" })

  if (error) {
    throw error
  }
}

const mapSubscriptionStatus = (status: Stripe.Subscription.Status): "premium" | "free" => {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return "premium"
    default:
      return "free"
  }
}

const extractCustomerId = (
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
): string | undefined => {
  if (!customer) return undefined
  if (typeof customer === "string") return customer
  return "id" in customer ? customer.id : undefined
}

const handleCheckoutCompleted = async (session: Stripe.Checkout.Session) => {
  const userId = session.metadata?.supabaseUserId
  const customerId = extractCustomerId(session.customer)

  if (!userId) {
    logInfo("stripe:webhook:checkout-missing-user", { sessionId: session.id })
    return
  }

  const credits = Number(session.metadata?.creditsPurchased ?? session.metadata?.credits)
  if (!Number.isFinite(credits) || credits <= 0) {
    logInfo("stripe:webhook:checkout-missing-credits", { sessionId: session.id, credits })
  }

  const admin = getAdminClient()
  if (customerId) {
    await mergeUserMetadata(userId, { stripe_customer_id: customerId })
    await upsertStripeCustomer(admin, userId, customerId)
    await upsertPublicUserStripeCustomer(admin, userId, customerId)
  }

  if (Number.isFinite(credits) && credits > 0) {
    await creditUserBalance(admin, userId, credits, {
      payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      checkout_session_id: session.id,
    })
  }
}

const creditUserBalance = async (
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  deltaCredits: number,
  opts: { payment_intent_id?: string; checkout_session_id?: string }
) => {
  if (!Number.isFinite(deltaCredits) || deltaCredits <= 0) {
    return
  }

  const { data: existingBalance, error: balanceError } = await admin
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle()

  if (balanceError) {
    throw balanceError
  }

  const current = Number(existingBalance?.balance ?? 0)
  const nextBalance = current + deltaCredits

  const { error: upsertError } = await admin.from("user_credits").upsert(
    {
      user_id: userId,
      balance: nextBalance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )
  if (upsertError) {
    throw upsertError
  }

  const ledgerRow = {
    id: randomUUID(),
    user_id: userId,
    delta: deltaCredits,
    balance_after: nextBalance,
    type: "purchase",
    payment_intent_id: opts.payment_intent_id ?? null,
    checkout_session_id: opts.checkout_session_id ?? null,
    created_at: new Date().toISOString(),
  }

  const { error: ledgerError } = await admin.from("credit_ledger").insert(ledgerRow)
  if (ledgerError) {
    throw ledgerError
  }
}

export async function POST(request: NextRequest) {
  logRequest(request, "stripe:webhook")

  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured" }, { status: 500 })
  }

  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  const stripe = getStripeClient()
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (err) {
    logError("stripe:webhook:signature-verification-failed", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        logInfo("stripe:webhook:subscription-event-ignored", { type: event.type })
        break
      default:
        logInfo("stripe:webhook:ignored-event", { type: event.type })
    }
  } catch (err) {
    logError("stripe:webhook:handler-error", err, { type: event.type })
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
