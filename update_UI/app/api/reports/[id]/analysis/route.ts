import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logRequest, logInfo, logError } from "@/lib/server/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: reportId } = await params
    logRequest(req, "reports/analysis:get")

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        // Verify ownership
        const { data: report, error: reportError } = await supabase
            .from("reports")
            .select("id")
            .eq("id", reportId)
            .eq("user_id", user.id)
            .maybeSingle()

        if (reportError || !report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 })
        }

        // Fetch latest analysis result
        const { data: analysis, error: analysisError } = await supabase
            .from("analysis_results")
            .select("*")
            .eq("report_id", reportId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (analysisError) {
            throw analysisError
        }

        // Fetch images
        const { data: images, error: imagesError } = await supabase
            .from("experiment_data")
            .select("file_name, file_url, uploaded_at")
            .eq("report_id", reportId)
            .eq("file_type", "image")
            .order("uploaded_at", { ascending: true })

        if (imagesError) {
            throw imagesError
        }

        // Generate signed URLs for images
        const imagesWithUrls = await Promise.all(
            (images || []).map(async (img) => {
                const path = (img.file_url || "").replace(/^\/+/, "")
                // Create a signed URL valid for 1 hour
                const { data: signed } = await supabase.storage
                    .from("experiment-files")
                    .createSignedUrl(path, 3600)

                return {
                    ...img,
                    file_url: signed?.signedUrl || img.file_url, // Fallback to original if signing fails
                }
            })
        )

        return NextResponse.json({
            analysis: analysis || null,
            images: imagesWithUrls,
        })
    } catch (error) {
        logError("reports/analysis:get-error", error)
        return NextResponse.json({ error: "Failed to fetch analysis data" }, { status: 500 })
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: reportId } = await params
    logRequest(req, "reports/analysis:put")

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    try {
        const body = await req.json()
        const { dify_response } = body

        if (!dify_response) {
            return NextResponse.json({ error: "Missing dify_response" }, { status: 400 })
        }

        // Verify ownership
        const { data: report, error: reportError } = await supabase
            .from("reports")
            .select("id")
            .eq("id", reportId)
            .eq("user_id", user.id)
            .maybeSingle()

        if (reportError || !report) {
            return NextResponse.json({ error: "Report not found" }, { status: 404 })
        }

        // Update the latest analysis result
        // We could create a new version, but for now updating the latest is sufficient for the editor
        // First find the latest ID
        const { data: latest, error: findError } = await supabase
            .from("analysis_results")
            .select("id")
            .eq("report_id", reportId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (findError) throw findError

        if (!latest) {
            // If no record exists, create one
            const { error: insertError } = await supabase
                .from("analysis_results")
                .insert([{ report_id: reportId, dify_response }])

            if (insertError) throw insertError
        } else {
            // Update existing
            const { error: updateError } = await supabase
                .from("analysis_results")
                .update({ dify_response })
                .eq("id", latest.id)

            if (updateError) throw updateError
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        logError("reports/analysis:put-error", error)
        return NextResponse.json({ error: "Failed to update analysis data" }, { status: 500 })
    }
}
