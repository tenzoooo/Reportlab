/* eslint-disable no-console */
/**
 * Extract UI state declarations from TS/TSX using the TypeScript AST.
 *
 * Captures:
 * - const [x, setX] = useState(...)
 * - const ref = useRef(...)
 * - localStorage keys used by getItem/setItem/removeItem
 *
 * Usage:
 *   node scripts/ui-audit/extract-ui-state.js docs/ui_audit/ui_state_catalog.json
 */

const fs = require("node:fs");
const path = require("node:path");

let ts;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  ts = require("typescript");
} catch (e) {
  console.error("Failed to load 'typescript'. Install deps (pnpm i) in update_UI first.");
  process.exit(1);
}

const ROOT = path.resolve(__dirname, "../..");

const INCLUDE_DIRS = ["app", "components", "hooks", "lib"].map((d) => path.join(ROOT, d));
const EXCLUDE_DIRS = new Set(
  [".next", "node_modules", ".agent_data", ".agent", "__pycache__", ".venv"].map((d) => path.join(ROOT, d))
);

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

const inferFromInitializerArg = (arg0) => {
  if (!arg0) return "unknown";
  if (arg0.kind === ts.SyntaxKind.TrueKeyword || arg0.kind === ts.SyntaxKind.FalseKeyword) return "boolean";
  if (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0)) return "string";
  if (ts.isNumericLiteral(arg0)) return "number";
  if (arg0.kind === ts.SyntaxKind.NullKeyword) return "null";
  if (arg0.kind === ts.SyntaxKind.UndefinedKeyword) return "undefined";
  if (ts.isArrayLiteralExpression(arg0)) return "array";
  if (ts.isObjectLiteralExpression(arg0)) return "object";
  return "unknown";
};

const callIs = (call, names) => {
  const expr = call.expression;
  if (ts.isIdentifier(expr) && names.includes(expr.text)) return expr.text;
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    const method = expr.name.text;
    if (names.includes(method)) return method;
  }
  return null;
};

const findEnclosingComponentName = (node) => {
  let cur = node;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && cur.name && ts.isIdentifier(cur.name)) return cur.name.text;
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      const parent = cur.parent;
      if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
    }
    cur = cur.parent;
  }
  return null;
};

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
      component: findEnclosingComponentName(node),
      ...payload,
    });
  };

  const visit = (node) => {
    // useState destructuring patterns.
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)) {
      const call = node.initializer;
      const callee = call.expression;
      const isUseState =
        (ts.isIdentifier(callee) && callee.text === "useState") ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.name) &&
          callee.name.text === "useState");

      if (isUseState && ts.isArrayBindingPattern(node.name)) {
        const [stateEl, setEl] = node.name.elements;
        const stateName = stateEl && ts.isBindingElement(stateEl) && ts.isIdentifier(stateEl.name) ? stateEl.name.text : null;
        const setterName = setEl && ts.isBindingElement(setEl) && ts.isIdentifier(setEl.name) ? setEl.name.text : null;
        const typeArg = call.typeArguments && call.typeArguments[0] ? call.typeArguments[0].getText(sf) : null;
        const inferred = inferFromInitializerArg(call.arguments[0]);
        record(node, {
          kind: "useState",
          state: stateName,
          setter: setterName,
          type: typeArg || inferred,
          initializer: call.arguments[0] ? call.arguments[0].getText(sf) : null,
        });
      }

      const isUseRef =
        (ts.isIdentifier(callee) && callee.text === "useRef") ||
        (ts.isPropertyAccessExpression(callee) &&
          ts.isIdentifier(callee.name) &&
          callee.name.text === "useRef");
      if (isUseRef && ts.isIdentifier(node.name)) {
        const typeArg = call.typeArguments && call.typeArguments[0] ? call.typeArguments[0].getText(sf) : null;
        record(node, {
          kind: "useRef",
          ref: node.name.text,
          type: typeArg || "unknown",
          initializer: call.arguments[0] ? call.arguments[0].getText(sf) : null,
        });
      }
    }

    // localStorage keys.
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        const obj = callee.expression.text;
        const method = callee.name.text;
        if ((obj === "localStorage" || obj === "window.localStorage") && ["getItem", "setItem", "removeItem"].includes(method)) {
          const arg0 = node.arguments[0];
          if (arg0 && ts.isStringLiteral(arg0)) {
            record(node, { kind: "localStorage", method, key: arg0.text });
          }
        }
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
    console.error("Output path required. Example: docs/ui_audit/ui_state_catalog.json");
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
  console.log(`Wrote ${all.length} state-ish items -> ${rel(outAbs)}`);
};

main();

