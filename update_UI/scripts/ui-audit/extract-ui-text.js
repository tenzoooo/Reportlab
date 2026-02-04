/* eslint-disable no-console */
/**
 * Extract user-facing-ish strings from TS/TSX using the TypeScript AST.
 *
 * Output is intentionally "over-inclusive" but biased toward UI text:
 * - JSXText
 * - JSX attribute string literals (placeholder, aria-label, title, etc.)
 * - Object properties with common UI keys (title/label/description/q/a/...)
 * - alert()/confirm() messages
 * - sonner toast.* messages
 *
 * Usage:
 *   node scripts/ui-audit/extract-ui-text.js docs/ui_audit/ui_text_catalog.json
 */

const fs = require("node:fs");
const path = require("node:path");

let ts;
try {
  // Prefer project-local TypeScript.
  // eslint-disable-next-line import/no-extraneous-dependencies
  ts = require("typescript");
} catch (e) {
  console.error("Failed to load 'typescript'. Install deps (pnpm i) in update_UI first.");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "../..");

const INCLUDE_DIRS = ["app", "components", "hooks"].map((d) => path.join(ROOT, d));
const EXCLUDE_DIRS = new Set(
  [".next", "node_modules", ".agent_data", ".agent", "__pycache__", ".venv"].map((d) => path.join(ROOT, d))
);

const UI_KEYS = new Set([
  "title",
  "label",
  "description",
  "desc",
  "subtitle",
  "placeholder",
  "aria-label",
  "ariaLabel",
  "message",
  "q",
  "a",
  "headerStatusLabel",
  "footerNote",
  "cancelLabel",
]);

const isExcluded = (absPath) => {
  for (const dir of EXCLUDE_DIRS) {
    if (absPath.startsWith(dir + path.sep) || absPath === dir) return true;
  }
  return false;
};

const walk = (dir, out) => {
  if (isExcluded(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (isExcluded(p)) continue;
    if (ent.isDirectory()) {
      walk(p, out);
      continue;
    }
    if (!ent.isFile()) continue;
    if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
};

const rel = (abs) => path.relative(ROOT, abs).replace(/\\/g, "/");

const loc = (sf, node) => {
  const start = node.getStart(sf, false);
  const { line, character } = sf.getLineAndCharacterOfPosition(start);
  return { line: line + 1, column: character + 1 };
};

const getStringLiteralValue = (expr) => {
  if (!expr) return null;
  if (ts.isStringLiteral(expr)) return { kind: "string", text: expr.text, dynamic: false };
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return { kind: "template", text: expr.text, dynamic: false };
  if (ts.isTemplateExpression(expr)) return { kind: "template", text: expr.getText(), dynamic: true };
  return null;
};

const getJsxAttrName = (attr) => {
  const name = attr.name;
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isJsxNamespacedName(name)) return `${name.namespace.text}:${name.name.text}`;
  return name.getText();
};

const isToastCall = (call) => {
  const expr = call.expression;
  if (!ts.isPropertyAccessExpression(expr)) return false;
  if (!ts.isIdentifier(expr.expression)) return false;
  return expr.expression.text === "toast";
};

const isAlertOrConfirm = (call) => {
  const expr = call.expression;
  if (!ts.isIdentifier(expr)) return false;
  return expr.text === "alert" || expr.text === "confirm";
};

const normalizeText = (s) => s.replace(/\s+/g, " ").trim();

const extractFromFile = (absPath) => {
  const content = fs.readFileSync(absPath, "utf8");
  const kind = absPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true, kind);

  /** @type {Array<any>} */
  const found = [];

  const record = (node, payload) => {
    const { line, column } = loc(sf, node);
    found.push({
      file: rel(absPath),
      line,
      column,
      ...payload,
    });
  };

  const visit = (node) => {
    // 1) JSXText: <div>こんにちは</div>
    if (ts.isJsxText(node)) {
      const t = normalizeText(node.text || "");
      if (t) {
        record(node, { source: "JSXText", text: t, dynamic: false });
      }
    }

    // 2) JSX attributes: placeholder="..." aria-label="..."
    if (ts.isJsxAttribute(node)) {
      const name = getJsxAttrName(node);
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) {
        const t = normalizeText(init.text);
        if (t) record(node, { source: "JSXAttr", attr: name, text: t, dynamic: false });
      }
    }

    // 3) Common UI-key strings in object literals: { label: "..." }
    if (ts.isPropertyAssignment(node)) {
      const nameNode = node.name;
      const key =
        ts.isIdentifier(nameNode) ? nameNode.text : ts.isStringLiteral(nameNode) ? nameNode.text : nameNode.getText(sf);

      if (UI_KEYS.has(key)) {
        const val = getStringLiteralValue(node.initializer);
        if (val) {
          const t = normalizeText(val.text);
          if (t) record(node, { source: "ObjectProp", key, text: t, dynamic: val.dynamic });
        }
      }
    }

    // 4) alert()/confirm()
    if (ts.isCallExpression(node) && isAlertOrConfirm(node)) {
      const arg0 = node.arguments[0];
      const val = getStringLiteralValue(arg0);
      if (val) {
        const t = normalizeText(val.text);
        if (t) record(node, { source: "BrowserDialog", fn: node.expression.text, text: t, dynamic: val.dynamic });
      }
    }

    // 5) toast.*("...")
    if (ts.isCallExpression(node) && isToastCall(node)) {
      const expr = node.expression;
      const method = expr.name?.text || expr.name?.getText?.() || "toast";
      const arg0 = node.arguments[0];
      const val = getStringLiteralValue(arg0);
      if (val) {
        const t = normalizeText(val.text);
        if (t) record(node, { source: "Toast", method, text: t, dynamic: val.dynamic });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sf);
  return found;
};

const main = () => {
  const outPathArg = process.argv[2];
  if (!outPathArg) {
    console.error("Output path required. Example: docs/ui_audit/ui_text_catalog.json");
    process.exit(2);
  }
  const outAbs = path.resolve(ROOT, outPathArg);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  /** @type {string[]} */
  const files = [];
  for (const dir of INCLUDE_DIRS) {
    if (fs.existsSync(dir)) walk(dir, files);
  }

  const all = files.flatMap((f) => extractFromFile(f));
  all.sort((a, b) => (a.file === b.file ? a.line - b.line || a.column - b.column : a.file.localeCompare(b.file)));

  fs.writeFileSync(outAbs, JSON.stringify({ generated_at: new Date().toISOString(), count: all.length, items: all }, null, 2));
  console.log(`Wrote ${all.length} UI-text-ish items -> ${rel(outAbs)}`);
};

main();

