
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
import path from "path"
import fetch from "node-fetch"

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const webhookUrl = "http://localhost:3001/api/stripe/webhook"

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function main() {
    console.log("Fetching a user...")
    // Get the first user to use for testing
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })

    if (error || !users || users.length === 0) {
        console.error("Failed to fetch user or no users found:", error)
        return
    }

    const user = users[0]
    console.log(`Using user: ${user.id} (${user.email})`)

    // Check current credits
    const { data: profile } = await supabase
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .single()

    console.log(`Current credits: ${profile?.credits}`)

    // Construct fake Stripe event
    const creditsToPurchase = 100
    const event = {
        id: `evt_test_${Date.now()}`,
        object: "event",
        api_version: "2023-10-16",
        created: Math.floor(Date.now() / 1000),
        type: "checkout.session.completed",
        data: {
            object: {
                id: `cs_test_${Date.now()}`,
                object: "checkout.session",
                mode: "payment",
                payment_status: "paid",
                status: "complete",
                metadata: {
                    userId: user.id,
                    creditsPurchased: String(creditsToPurchase)
                },
                customer_details: {
                    email: user.email
                }
            }
        }
    }

    console.log("Sending webhook event...", JSON.stringify(event, null, 2))

    try {
        const response = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // We don't send a valid signature, relying on dev fallback
                "Stripe-Signature": "t=123,v1=invalid_signature"
            },
            body: JSON.stringify(event)
        })

        const text = await response.text()
        console.log(`Response Status: ${response.status}`)
        console.log(`Response Body: ${text}`)

        if (response.ok) {
            console.log("Webhook processed successfully.")

            // Wait a bit for async processing if any (though webhook handler awaits db calls)
            await new Promise(r => setTimeout(r, 1000))

            const { data: newProfile } = await supabase
                .from("profiles")
                .select("credits")
                .eq("id", user.id)
                .single()

            console.log(`New credits: ${newProfile?.credits}`)
            const diff = (newProfile?.credits || 0) - (profile?.credits || 0)
            console.log(`Credit difference: ${diff}`)

            if (diff === creditsToPurchase) {
                console.log("SUCCESS: Credits added correctly.")
            } else {
                console.log("FAILURE: Credits were not added correctly.")
            }

        } else {
            console.error("Webhook failed.")
        }

    } catch (err) {
        console.error("Error sending webhook:", err)
    }
}

main()
