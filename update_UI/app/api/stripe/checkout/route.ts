import { getStripeClient } from "@/lib/stripe/client"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type Stripe from "stripe"

const TRIAL_PERIOD_DAYS: number = 7

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function hasAnySubscriptionRecorded(supabase: SupabaseServerClient, userId: string): Promise<boolean> {
    const { data, error } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
    if (error) {
        console.error("[STRIPE_CHECKOUT] Failed to check prior subscriptions in Supabase:", error)
        // Safety-first: if we cannot prove the user is new, do not grant a trial.
        return true
    }
    return Boolean(data)
}

async function hasAnyStripeSubscriptionForEmail(stripe: Stripe, email: string): Promise<boolean> {
    try {
        const customers = await stripe.customers.list({ email, limit: 3 })
        for (const customer of customers.data) {
            const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 1 })
            if (subs.data.length > 0) return true
        }
        return false
    } catch (err) {
        console.error("[STRIPE_CHECKOUT] Failed to check prior subscriptions in Stripe:", err)
        // Safety-first: if we cannot prove the user is new, do not grant a trial.
        return true
    }
}

async function shouldApplyTrialOncePerUser(params: {
    supabase: SupabaseServerClient
    stripe: Stripe
    userId: string
    email: string | null
}): Promise<boolean> {
    const { supabase, stripe, userId, email } = params

    const hasRecorded = await hasAnySubscriptionRecorded(supabase, userId)
    if (hasRecorded) return false

    if (!email) return false
    const hasStripeHistory = await hasAnyStripeSubscriptionForEmail(stripe, email)
    return !hasStripeHistory
}

export async function POST(req: Request) {
    try {
        const { priceId } = await req.json()
        if (!priceId || typeof priceId !== "string") {
            return NextResponse.json({ error: "Missing or invalid priceId" }, { status: 400 })
        }
        const stripe = getStripeClient()
        const supabase = await createClient()

        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const shouldApplyTrial: boolean = await shouldApplyTrialOncePerUser({
            supabase,
            stripe,
            userId: user.id,
            email: user.email ?? null,
        })

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

        const session = await stripe.checkout.sessions.create({
            customer_email: user.email ?? undefined,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
            subscription_data: shouldApplyTrial ? { trial_period_days: TRIAL_PERIOD_DAYS } : undefined,
            success_url: `${baseUrl}/dashboard/settings?tab=subscription&success=true`,
            cancel_url: `${baseUrl}/dashboard/settings?tab=subscription&canceled=true`,
            metadata: {
                userId: user.id,
            },
        })

        return NextResponse.json({ url: session.url })
    } catch (error) {
        console.error("[STRIPE_CHECKOUT]", error)
        const errorMessage = error instanceof Error ? error.message : "Internal Error"
        return NextResponse.json({ error: errorMessage }, { status: 500 })
    }
}
