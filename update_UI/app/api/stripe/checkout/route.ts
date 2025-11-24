import { getStripeClient } from "@/lib/stripe/client"
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
    try {
        const { priceId } = await req.json()
        const stripe = getStripeClient()
        const supabase = await createClient()

        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 })
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"

        const session = await stripe.checkout.sessions.create({
            customer_email: user.email,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: "subscription",
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
