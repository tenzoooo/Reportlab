import OpenAI from "openai";
import { parsePdfText, cleanExtractedText } from "@/lib/pdf/parser";
import { PDF_CONTEXT_PROMPT } from "./prompts";
import { ExperimentDefinitionSchema, type ExperimentDefinition } from "./types";
import { logInfo, logError } from "@/lib/server/logger";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function analyzePdf(pdfBuffer: Buffer): Promise<ExperimentDefinition | null> {
    try {
        logInfo("caption-gen:pdf-analysis:start", { size: pdfBuffer.length, model: MODEL });

        const rawText = await parsePdfText(pdfBuffer);
        const text = cleanExtractedText(rawText);

        logInfo("caption-gen:pdf-analysis:text-extracted", { length: text.length });

        const completion = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                { role: "system", content: PDF_CONTEXT_PROMPT },
                { role: "user", content: text },
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
            throw new Error("No content received from OpenAI");
        }

        const json = JSON.parse(content);
        const result = ExperimentDefinitionSchema.parse(json);

        logInfo("caption-gen:pdf-analysis:success", { experiment_id: result.experiment_id, context_length: result.context?.length });
        return result;

    } catch (error) {
        logError("caption-gen:pdf-analysis:error", error);
        throw error;
    }
}
