import { getStripeClient } from "@/lib/stripe/client"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    try {
        const stripe = getStripeClient()
        const supabase = await createClient()

        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        // Find the subscription to get the customer ID
        // We try to find the most recent active subscription
        const { data: subscription } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("user_id", user.id)
            .in("status", ["active", "trialing", "past_due"])
            .order("created_at", { ascending: false })
            .limit(1)
            .single()

        if (!subscription) {
            return new NextResponse("No active subscription found", { status: 404 })
        }

        // Retrieve subscription from Stripe to get customer ID
        const stripeSubscription = await stripe.subscriptions.retrieve(subscription.id)
        const customerId = stripeSubscription.customer as string

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${baseUrl}/dashboard/settings?tab=subscription`,
        })

        return NextResponse.json({ url: session.url })
    } catch (error) {
        console.error("[STRIPE_PORTAL]", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
