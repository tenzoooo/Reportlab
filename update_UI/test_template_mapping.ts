import { buildDocTemplateData } from "./lib/docx/template-data"

const sampleJson = {
    "consideration": {
        "units": [
            {
                "index": 1,
                "discussion_active": "Test Discussion 1",
                "answer": "Test Answer 1"
            },
            {
                "index": 2,
                "discussion_active": "Test Discussion 2"
            }
        ],
        "chapter": 5,
        "summary": "Test Summary",
        "experiments": [
            {
                "idx": 1,
                "name": "Test Experiment",
                "tables": [],
                "figures": []
            }
        ]
    }
}

const result = buildDocTemplateData(sampleJson)

console.log("Experiments count:", result.experiments.length)
console.log("Consideration units count:", result.consideration.units.length)
console.log("Considerations array count:", result.considerations.length)
console.log("First unit discussion:", result.considerations[0]?.discussion_active)

if (result.experiments.length === 0) {
    console.log("WARNING: Experiments are empty! The JSON structure might be nested incorrectly.")
}
