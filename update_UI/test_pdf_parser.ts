import { parsePdfText } from "./lib/pdf/parser";
import fs from "fs";
import path from "path";

async function test() {
    const pdfPath = path.join(process.cwd(), "test.pdf");
    if (!fs.existsSync(pdfPath)) {
        console.error("test.pdf not found");
        process.exit(1);
    }
    const buffer = fs.readFileSync(pdfPath);
    try {
        console.log("Parsing PDF...");
        const text = await parsePdfText(buffer);
        console.log("Parsed text length:", text.length);
        console.log("Preview:", text.substring(0, 100));
    } catch (error) {
        console.error("Error parsing PDF:", error);
    }
}

test();
