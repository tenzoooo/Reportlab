
import { NextRequest, NextResponse } from "next/server";
import { logRequest, logError } from "@/lib/server/logger";
import { ExperimentDefinitionSchema, ObservedImageDataSchema } from "@/lib/caption-generation/types";
import { generateCaption } from "@/lib/caption-generation/matching-service"; // Added this line

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
    logRequest(req, "caption-gen:match:start");

    try {
        const body = await req.json();

        // Validate inputs
        const observed = ObservedImageDataSchema.parse(body.observed);
        const definitions = ExperimentDefinitionSchema.parse(body.definitions);

        const result = await generateCaption(observed, definitions);

        return NextResponse.json(result);
    } catch (error) {
        logError("caption-gen:match:error", error);
        return NextResponse.json({ error: "Invalid request or internal error" }, { status: 400 });
    }
}
