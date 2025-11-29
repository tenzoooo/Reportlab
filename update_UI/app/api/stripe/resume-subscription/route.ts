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

        // Find the active subscription that is scheduled to cancel
        const { data: subscription, error: subError } = await supabase
            .from("subscriptions")
            .select("id")
            .eq("user_id", user.id)
            .in("status", ["active", "trialing"])
            .eq("cancel_at_period_end", true) // Only find ones scheduled to cancel
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (subError) {
            console.error("[RESUME_SUBSCRIPTION] Database error:", subError)
            return NextResponse.json({ error: "Database error" }, { status: 500 })
        }

        if (!subscription) {
            return NextResponse.json({ error: "No subscription scheduled for cancellation found" }, { status: 404 })
        }

        // Resume the subscription by setting cancel_at_period_end to false
        const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: false,
        })

        // Update the local database
        const { error: updateError } = await supabase
            .from("subscriptions")
            .update({ cancel_at_period_end: false })
            .eq("id", subscription.id)

        if (updateError) {
            console.error("[RESUME_SUBSCRIPTION] Failed to update database:", updateError)
            // Even if DB update fails, the Stripe subscription is already updated
        }

        return NextResponse.json({
            success: true,
            cancel_at_period_end: updatedSubscription.cancel_at_period_end,
        })
    } catch (error) {
        console.error("[RESUME_SUBSCRIPTION]", error)
        return NextResponse.json({ error: "Internal Error" }, { status: 500 })
    }
}
