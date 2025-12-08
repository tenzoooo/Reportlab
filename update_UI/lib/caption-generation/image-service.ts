import OpenAI from "openai";
import { IMAGE_ANALYSIS_SYSTEM_PROMPT } from "./prompts";
import { ObservedImageDataSchema, type ObservedImageData } from "./types";
import { logInfo, logError } from "@/lib/server/logger";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzeImage(imageBuffer: Buffer): Promise<ObservedImageData | null> {
    try {
        logInfo("caption-gen:image-analysis:start", { size: imageBuffer.length, model: MODEL });

        const base64Image = imageBuffer.toString("base64");
        const dataUrl = `data:image/jpeg;base64,${base64Image}`;

        const completion = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                { role: "system", content: IMAGE_ANALYSIS_SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Analyze this experiment result image and extract data." },
                        {
                            type: "image_url",
                            image_url: {
                                url: dataUrl,
                                detail: "high",
                            },
                        },
                    ],
                },
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error("No content received from OpenAI");
        }

        const json = JSON.parse(content);
        const result = ObservedImageDataSchema.parse(json);

        logInfo("caption-gen:image-analysis:success", {
            headers: result.detected_headers,
            metadata: result.metadata
        });
        return result;

    } catch (error) {
        logError("caption-gen:image-analysis:error", error);
        return null;
    }
}
