import { z } from "zod";

// --- Expected Schema (from PDF) ---

export const ExperimentDefinitionSchema = z.object({
    experiment_id: z.string().optional(),
    context: z.string().optional().describe("Summary or context of the experiment extracted from the text"),
    experiments: z.array(z.object({
        name: z.string(),
        description: z.string()
    })).optional().describe("List of potential experiments found in the document"),

    // New Hierarchical Structure
    experiment_title: z.string().optional(),
    objective: z.string().optional(),
    theoretical_background: z.string().optional().describe("Formulas, theory, and expected values related to the experiment"),
    methodology_structure: z.array(z.object({
        section_number: z.string().optional(),
        section_title: z.string(),
        items: z.array(z.object({
            item_number: z.string().optional(),
            name: z.string().optional(),
            description: z.string().optional(),
            conditions: z.array(z.string()).optional()
        }))
    })).optional()
});

export type ExperimentDefinition = z.infer<typeof ExperimentDefinitionSchema>;


// --- Observed Schema (from Image) ---

export const ObservedImageDataSchema = z.object({
    detected_headers: z.array(z.string()),
    detected_values: z.object({
        row_start: z.array(z.number()).optional(),
        row_end: z.array(z.number()).optional(),
        all_values: z.array(z.array(z.number())).optional(), // For more detailed matching if needed
    }).optional(),
    metadata: z.object({
        detected_temp: z.string().optional(),
        detected_title: z.string().optional(),
        image_type: z.enum(["table", "figure", "other"]).optional().describe("Classify if the image is a data table or a chart/graph/figure"),
    }).optional(),
    // New Quantitative Analysis Data
    analysis_data: z.object({
        trend: z.string().optional().describe("Description of the trend (e.g., linear increase, saturation, exponential)"),
        max_value: z.string().optional(),
        min_value: z.string().optional(),
        linearity: z.string().optional().describe("Assessment of linearity (High, Medium, Low)"),
        outliers: z.string().optional().describe("Any detected outliers")
    }).optional()
});

export type ObservedImageData = z.infer<typeof ObservedImageDataSchema>;


// --- Caption Generation Result ---

export interface CaptionGenerationResult {
    generated_caption: string;
    experiment_name?: string;
    quantitative_comment?: string;
}
