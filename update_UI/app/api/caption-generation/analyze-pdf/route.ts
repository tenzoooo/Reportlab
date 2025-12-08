import { NextRequest, NextResponse } from "next/server";
import { analyzePdf } from "@/lib/caption-generation/pdf-service";
import { logRequest, logError } from "@/lib/server/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    logRequest(req, "caption-gen:analyze-pdf:start");

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await analyzePdf(buffer);



        return NextResponse.json(result);
    } catch (error) {
        logError("caption-gen:analyze-pdf:error", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
    }
}
