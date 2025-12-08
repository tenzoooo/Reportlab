import OpenAI from "openai";
import {
    type ObservedImageData,
    type ExperimentDefinition,
    type CaptionGenerationResult
} from "./types";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const CAPTION_GENERATION_PROMPT = `
You are an expert scientific assistant.
Your task is to identify the specific experiment/test shown in the image and generate a precise caption.

Experiment Context:
{context}

Candidate Experiments:
{experiments_list}

Observed Image Data:
Detected Headers: {detected_headers}
Detected Metadata: {metadata}

Instructions:
1. Analyze the "Experiment Context", "Candidate Experiments", and "Observed Image Data".
2. Identify the specific experiment from "Candidate Experiments" that this image corresponds to. If none match exactly, infer from context.
3. Generate a natural Japanese caption.
   - Output ONLY the descriptive text (e.g., "短絡試験の測定結果").
   - Do NOT include any prefix like "図1:", "表1:", or "Figure X:".
   - The numbering will be handled by the frontend application.
   - Suffix Rules:
     - If the image is a graph/chart/figure, the caption MUST end with "グラフ" (e.g., "短絡試験のV-I特性グラフ").
     - If the image is a table or data log, the caption MUST end with "観測結果" (e.g., "短絡試験の観測結果").
4. Output the result as a JSON object with the following keys:
   - "experiment_name": The name of the identified experiment/test (in Japanese).
   - "caption": The generated caption (in Japanese).
`;

import { QUANTITATIVE_COMMENT_PROMPT } from "./prompts";

// ... existing code ...

export async function generateCaption(
    observed: ObservedImageData,
    definition: ExperimentDefinition
): Promise<CaptionGenerationResult> {

    let generatedCaption = "Caption generation failed.";
    let experimentName = undefined;
    let quantitativeComment = undefined;

    try {
        // ... (existing flattening logic) ...
        // Flatten experiments list from hierarchical structure if available
        let experimentsList = [];
        if (definition.methodology_structure) {
            for (const section of definition.methodology_structure) {
                for (const item of section.items) {
                    experimentsList.push({
                        section: section.section_title,
                        name: item.name || "",
                        description: item.description || "",
                        conditions: item.conditions
                    });
                }
            }
        } else {
            // Fallback to old flat list
            experimentsList = definition.experiments || [];
        }

        const context = definition.objective || definition.context || "";

        const prompt = CAPTION_GENERATION_PROMPT
            .replace("{context}", context)
            .replace("{experiments_list}", JSON.stringify(experimentsList))
            .replace("{detected_headers}", observed.detected_headers.join(", "))
            .replace("{metadata}", JSON.stringify(observed.metadata || {}));

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: [
                { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
            const json = JSON.parse(content);
            generatedCaption = json.caption || "Caption generation failed.";
            experimentName = json.experiment_name;

            // --- Quantitative Comment Generation (Step 2) ---
            if (experimentName && observed.analysis_data) {
                const commentPrompt = QUANTITATIVE_COMMENT_PROMPT
                    .replace("{experiment_name}", experimentName)
                    .replace("{context}", context)
                    .replace("{theoretical_background}", definition.theoretical_background || "情報なし")
                    .replace("{image_type}", observed.metadata?.image_type || "unknown")
                    .replace("{analysis_data}", JSON.stringify(observed.analysis_data))
                    .replace("{detected_values}", JSON.stringify(observed.detected_values || {}));

                const commentCompletion = await openai.chat.completions.create({
                    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                    messages: [
                        { role: "user", content: commentPrompt },
                    ],
                });

                quantitativeComment = commentCompletion.choices[0]?.message?.content?.trim();
            }
        }

    } catch (error) {
        console.error("Failed to generate caption with LLM", error);
        generatedCaption = "Caption generation failed due to an error.";
    }

    return {
        generated_caption: generatedCaption,
        experiment_name: experimentName,
        quantitative_comment: quantitativeComment
    };
}
