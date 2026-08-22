export type ExtractedFunction = {
  name: string;
  params: string[];
  returnExpr: string;
};

const FN_RE =
  /(?:export\s+)?function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{\s*return\s+([^;]+);/g;

export function extractFunctions(source: string): ExtractedFunction[] {
  const found: ExtractedFunction[] = [];
  const re = new RegExp(FN_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const name = match[1];
    const rawParams = match[2] ?? "";
    const returnExpr = (match[3] ?? "").trim();
    if (!name || !returnExpr) continue;
    const params = rawParams
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/[?=].*$/, "").replace(/:\s*[\w.[\]| ]+$/, "").trim())
      .filter(Boolean);
    found.push({ name, params, returnExpr });
  }
  return found;
}

export function extractFunction(source: string, name: string): ExtractedFunction | null {
  return extractFunctions(source).find((fn) => fn.name === name) ?? null;
}

export function replaceReturnExpr(source: string, name: string, nextExpr: string): string {
  const re = new RegExp(
    `((?:export\\s+)?function\\s+${escapeRegExp(name)}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\s*\\{\\s*return\\s+)([^;]+)(;)`,
  );
  if (!re.test(source)) {
    throw new Error(`Cannot replace return expression for ${name}`);
  }
  return source.replace(re, `$1${nextExpr}$3`);
}

export function prependComment(source: string, comment: string): string {
  const line = `// ${comment.replace(/\s+/g, " ").trim()}`;
  if (source.startsWith(line)) return source;
  return `${line}\n${source}`;
}

export function executeExportedFunction(source: string, name: string, args: unknown[]): unknown {
  const fn = extractFunction(source, name);
  if (!fn) throw new Error(`Function ${name} not found`);
  if (fn.params.length !== args.length) {
    throw new Error(`${name} expected ${fn.params.length} args, got ${args.length}`);
  }
  const env: Record<string, unknown> = {};
  fn.params.forEach((param, index) => {
    env[param] = args[index];
  });
  return evaluateExpr(fn.returnExpr, env);
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function evaluateExpr(expr: string, env: Record<string, unknown>): unknown {
  const tokens = tokenize(expr);
  return evalTokens(tokens, env);
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "str"; value: string }
  | { kind: "op"; value: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i] ?? "";
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let buf = "";
      while (j < expr.length && expr[j] !== quote) {
        buf += expr[j];
        j += 1;
      }
      tokens.push({ kind: "str", value: buf });
      i = j + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j] ?? "")) j += 1;
      tokens.push({ kind: "num", value: Number(expr.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_]/.test(expr[j] ?? "")) j += 1;
      tokens.push({ kind: "id", value: expr.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`Unsupported expression token: ${ch}`);
  }
  return tokens;
}

function evalTokens(tokens: Token[], env: Record<string, unknown>): unknown {
  if (tokens.length === 1) return tokenValue(tokens[0]!, env);
  if (tokens.length === 3 && tokens[1]?.kind === "op") {
    const left = tokenValue(tokens[0]!, env);
    const right = tokenValue(tokens[2]!, env);
    const op = tokens[1].value;
    if (typeof left === "string" || typeof right === "string") {
      if (op === "+") return String(left) + String(right);
      throw new Error(`Unsupported string operator ${op}`);
    }
    const a = Number(left);
    const b = Number(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error("Non-numeric operand");
    if (op === "+") return a + b;
    if (op === "-") return a - b;
    if (op === "*") return a * b;
    if (op === "/") {
      if (b === 0) throw new Error("Division by zero");
      return a / b;
    }
  }
  if (tokens.length === 5 && tokens[1]?.kind === "op" && tokens[3]?.kind === "op") {
    const left = evalTokens(tokens.slice(0, 3), env);
    return evalTokens(
      [
        { kind: "num", value: Number(left) },
        tokens[3]!,
        tokens[4]!,
      ],
      env,
    );
  }
  throw new Error(`Unsupported expression: ${tokens.map((t) => t.value).join(" ")}`);
}

function tokenValue(token: Token, env: Record<string, unknown>): unknown {
  if (token.kind === "num" || token.kind === "str") return token.value;
  if (token.kind === "id") {
    if (!(token.value in env)) throw new Error(`Unknown identifier ${token.value}`);
    return env[token.value];
  }
  throw new Error("Expected value token");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
