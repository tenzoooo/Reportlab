import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createClient as createAdminClient } from "@supabase/supabase-js"
import { getStripeClient } from "@/lib/stripe/client"
import { logError, logRequest } from "@/lib/server/logger"
import type { Database } from "@/legacy/lib/supabase/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ensureAdminClient = () => {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured")
  }
  return createAdminClient<Database>(supabaseUrl, serviceRoleKey)
}

type AdminClient = ReturnType<typeof ensureAdminClient>

const upsertStripeCustomer = async (admin: AdminClient, userId: string, customerId: string) => {
  const { error } = await admin
    .from("stripe_customers")
    .upsert({ user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) throw error
}

const upsertPublicUserStripeCustomer = async (
  admin: AdminClient,
  userId: string,
  customerId: string,
  email?: string | null
) => {
  const ensuredEmail = email || (await fetchAuthUser(admin, userId))?.email
  if (!ensuredEmail) {
    throw new Error("Missing email for public.users upsert")
  }

  const { error } = await admin
    .from("users")
    .upsert(
      { id: userId, email: ensuredEmail, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    )
  if (error) throw error
}

const fetchAuthUser = async (admin: AdminClient, userId: string) => {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error) throw error
  return data.user
}

export async function POST(request: NextRequest) {
  logRequest(request, "stripe:create-customer")

  const routeSecrets = [process.env.API_ROUTE_SECRET, process.env.NEXT_PUBLIC_API_ROUTE_SECRET].filter(
    (secret): secret is string => !!secret
  )
  const providedSecret =
    request.headers.get("x-api-route-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")

  if (routeSecrets.length === 0) {
    return NextResponse.json({ error: "API route secret is not configured" }, { status: 500 })
  }

  if (!providedSecret || !routeSecrets.includes(providedSecret)) {
    return NextResponse.json({ error: "APIを叩く権限がありません" }, { status: 403 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = ensureAdminClient()
  const existingCustomerId =
    typeof user.user_metadata?.stripe_customer_id === "string" && user.user_metadata.stripe_customer_id.trim()
      ? user.user_metadata.stripe_customer_id
      : undefined

  try {
    if (existingCustomerId) {
      await upsertStripeCustomer(admin, user.id, existingCustomerId)
      await upsertPublicUserStripeCustomer(admin, user.id, existingCustomerId, user.email)
      return NextResponse.json({ stripeCustomerId: existingCustomerId })
    }

    const stripe = getStripeClient()
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name : undefined,
      metadata: {
        supabaseUserId: user.id,
      },
    })

    const authUser = await fetchAuthUser(admin, user.id)
    if (!authUser) {
      throw new Error("Failed to fetch user for metadata update")
    }

    const mergedMetadata = {
      ...(authUser.user_metadata || {}),
      stripe_customer_id: customer.id,
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: mergedMetadata,
    })
    if (updateError) {
      throw updateError
    }

    await upsertStripeCustomer(admin, user.id, customer.id)
    await upsertPublicUserStripeCustomer(admin, user.id, customer.id, authUser.email)

    return NextResponse.json({ stripeCustomerId: customer.id })
  } catch (err) {
    logError("stripe:create-customer", err)
    return NextResponse.json({ error: "Failed to create customer" }, { status: 500 })
  }
}
