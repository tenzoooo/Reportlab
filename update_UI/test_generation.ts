import { generateReport } from "./lib/docx/generator"
import fs from "fs"
import path from "path"

const sampleDifyOutput = {
    "chapter": 5,
    "experiments": [
        {
            "idx": 1,
            "name": "Test Experiment",
            "description_brief": "Brief description.",
            "tables": [{ "label": "Table 1", "caption": "Test Table", "rows": [["A", "B"], ["1", "2"]] }],
            "figures": []
        }
    ],
    "consideration": {
        "units": [],
        "reference_list_formatted": []
    },
    "summary": "Summary"
}

async function main() {
    console.log("Starting generation test...")
    try {
        const buffer = await generateReport({
            title: "Test Report",
            difyOutput: sampleDifyOutput,
            figureImages: []
        })

        const outputPath = path.join(process.cwd(), "test_output.docx")
        fs.writeFileSync(outputPath, buffer)
        console.log(`Successfully generated DOCX at ${outputPath}`)
    } catch (error) {
        console.error("Generation failed:", error)
        process.exit(1)
    }
}

main()
