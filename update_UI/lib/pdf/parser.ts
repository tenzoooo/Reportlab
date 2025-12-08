import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const resolvePdfWorkerSrc = (): string | null => {
    // Try to locate pdfjs-dist worker within pnpm store
    const pnpmDir = path.join(process.cwd(), "node_modules", ".pnpm")
    if (!fs.existsSync(pnpmDir)) return null

    const entries = fs.readdirSync(pnpmDir)
    const pdfjsDir = entries.find((e) => e.startsWith("pdfjs-dist@"))
    if (!pdfjsDir) return null

    const base = path.join(pnpmDir, pdfjsDir, "node_modules", "pdfjs-dist")
    const candidates = [
        path.join(base, "build", "pdf.worker.min.mjs"),
        path.join(base, "build", "pdf.worker.mjs"),
        path.join(base, "legacy", "build", "pdf.worker.min.mjs"),
        path.join(base, "legacy", "build", "pdf.worker.mjs"),
    ]

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return pathToFileURL(candidate).toString()
        }
    }

    return null
}

export const parsePdfText = async (buffer: Buffer): Promise<string> => {
    // pdf-parse は ESM で default を持たないことがあるので動的 import で両対応する
    const pdfParseModule = await import("pdf-parse")
    const candidate = pdfParseModule as unknown as { default?: unknown; PDFParse?: unknown }

    // Custom page render function to filter out artifacts
    const renderPage = (pageData: any) => {
        // check documents https://mozilla.github.io/pdf.js/
        // pageData is a PDFPageProxy
        return pageData.getTextContent({
            normalizeWhitespace: true,
            disableCombineTextItems: false,
        }).then((textContent: any) => {
            let lastY, text = '';
            // Log that custom render is running (once per page)
            // console.log(`[DEBUG] renderPage called for a page with ${textContent.items.length} items`)

            for (let item of textContent.items) {
                let str = item.str;

                // Skip empty strings
                if (!str || !str.trim()) continue;

                // Aggressively strip XML-like tags from WITHIN the string
                // This handles cases where the tag is attached to other text (e.g. "Text<w:r>")
                str = str.replace(/<[/]?[a-zA-Z0-9:]+[^>]*>/g, "");

                // If string became empty after stripping, skip it
                if (!str.trim()) continue;

                if (lastY == item.transform[5] || !lastY) {
                    text += str;
                } else {
                    text += '\n' + str;
                }
                lastY = item.transform[5];
            }
            return text;
        });
    }

    const options = {
        pagerender: renderPage
    }

    if (typeof candidate.default === "function") {
        const res = await (candidate.default as (input: Buffer, options?: any) => Promise<{ text: string }>)(buffer, options)
        return res?.text ?? ""
    }
    if (typeof (pdfParseModule as unknown as any) === "function") {
        const res = await (pdfParseModule as unknown as (input: Buffer, options?: any) => Promise<{ text: string }>)(buffer, options)
        return res?.text ?? ""
    }

    const ParserClass = candidate.PDFParse
    if (typeof ParserClass === "function") {
        // Note: The class-based usage of pdf-parse might not support the options object in the constructor 
        // the same way the function export does, or it might need a different approach.
        // However, usually the function export is what's used.
        // If we fall back to class, we might miss the custom render if not supported, 
        // but the regex cleaning downstream will still catch it.
        const parser = new (ParserClass as any)({ data: buffer })
        // worker の import 失敗を避けるため、サーバー環境ではローカルの workerSrc を解決して設定する
        if (typeof (ParserClass as any).setWorker === "function") {
            try {
                const workerSrc = resolvePdfWorkerSrc()
                if (workerSrc) {
                    ; (ParserClass as any).setWorker(workerSrc)
                }
            } catch {
                // ignore
            }
        }
        try {
            const textResult = await parser.getText?.()
            const text = textResult?.text ?? ""
            return text
        } finally {
            if (typeof parser.destroy === "function") {
                await parser.destroy()
            }
        }
    }

    throw new Error("pdf-parse module did not expose a usable parser")
}

export const cleanExtractedText = (raw: string): string => {
    if (!raw) return ""
    // Decode common HTML entities then strip XML/HTML-like tags and collapse whitespace
    const decoded = raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    return decoded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}
