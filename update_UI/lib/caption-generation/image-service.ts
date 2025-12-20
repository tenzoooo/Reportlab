import OpenAI from "openai";
import { IMAGE_ANALYSIS_SYSTEM_PROMPT } from "./prompts";
import { ObservedImageDataSchema, type ObservedImageData } from "./types";
import { logInfo, logError } from "@/lib/server/logger";

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

type ExperimentContext = { idx?: number; name?: string; description_brief?: string }

export type AnalyzeImageOptions = {
    methodText?: string;
    experiments?: ExperimentContext[];
};

const buildContextText = (options?: AnalyzeImageOptions): string => {
    if (!options) return "";
    const chunks: string[] = [];
    if (options.methodText) {
        const trimmed = options.methodText.slice(0, 4000); // safety limit
        chunks.push(`【実験方法抜粋】\n${trimmed}`);
    }
    if (options.experiments && options.experiments.length > 0) {
        const summary = options.experiments
            .slice(0, 12)
            .map((exp) => `- idx:${exp.idx ?? "?"} ${exp.name ?? ""} ${exp.description_brief ?? ""}`)
            .join("\n");
        chunks.push(`【実験候補一覧】\n${summary}`);
    }
    return chunks.join("\n\n");
};

export async function analyzeImage(imageBuffer: Buffer, options?: AnalyzeImageOptions): Promise<ObservedImageData | null> {
    try {
        logInfo("caption-gen:image-analysis:start", { size: imageBuffer.length, model: MODEL });

        const base64Image = imageBuffer.toString("base64");
        const dataUrl = `data:image/jpeg;base64,${base64Image}`;
        const contextText = buildContextText(options);

        const completion = await openai.chat.completions.create({
            model: MODEL,
            messages: [
                { role: "system", content: IMAGE_ANALYSIS_SYSTEM_PROMPT },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text:
                                "Analyze this experiment result image and extract data. " +
                                "If possible, determine which experiment (idx/name) this image likely belongs to, using the provided method text and candidate list.",
                        },
                        ...(contextText
                            ? [
                                {
                                    type: "text",
                                    text: contextText,
                                } as const,
                            ]
                            : []),
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
            metadata: result.metadata,
            experiment_hint: result.experiment_hint,
        });
        return result;

    } catch (error) {
        logError("caption-gen:image-analysis:error", error);
        return null;
    }
}
