import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/caption-generation/image-service";
import { logRequest, logError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    logRequest(req, "caption-gen:analyze-image:start");

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await analyzeImage(buffer);

        if (!result) {
            return NextResponse.json({ error: "Failed to analyze Image" }, { status: 500 });
        }

        return NextResponse.json(result);
    } catch (error) {
        logError("caption-gen:analyze-image:error", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
