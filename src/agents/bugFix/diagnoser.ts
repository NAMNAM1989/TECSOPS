import { executeExportedFunction, extractFunction, extractFunctions, valuesEqual } from "./sourceExec";
import type { BehaviorCase, Confidence, Hypothesis, Observation } from "./types";

export function observationsFromCases(
  cases: BehaviorCase[],
  run: (fnName: string, args: unknown[]) => unknown,
): Observation[] {
  return cases.map((testCase) => {
    try {
      const actual = run(testCase.functionName, testCase.input);
      return { ...testCase, actual, passed: valuesEqual(actual, testCase.expected) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ...testCase, actual: undefined, passed: false, error: message };
    }
  });
}

export function diagnose(input: {
  description: string;
  files: Record<string, string>;
  observations: Observation[];
  rejectedExprs?: string[];
}): Hypothesis[] {
  const rejected = new Set(input.rejectedExprs ?? []);
  const hypotheses: Hypothesis[] = [];
  const functions = Object.entries(input.files).flatMap(([path, source]) =>
    extractFunctions(source).map((fn) => ({ ...fn, path, source })),
  );

  const byFunction = groupBy(
    input.observations.filter((item) => !item.passed || input.observations.some((other) => !other.passed)),
    (item) => item.functionName,
  );

  for (const [functionName, rows] of byFunction) {
    const target = functions.find((fn) => fn.name === functionName);
    if (!target) continue;
    const candidates = unique(proposeExpressions(target.params, rows));
    const scored = candidates
      .filter((expr) => expr !== target.returnExpr && !rejected.has(expr))
      .map((expr) => ({
        expr,
        fits: rows.filter((row) => {
          try {
            return valuesEqual(evaluateCandidate(expr, target.params, row.input), row.expected);
          } catch {
            return false;
          }
        }).length,
        complexity: exprComplexity(expr),
      }))
      .filter((row) => row.fits > 0)
      .sort((a, b) => b.fits - a.fits || a.complexity - b.complexity);

    const bestFit = scored[0]?.fits ?? 0;
    for (const [index, row] of scored.slice(0, 4).entries()) {
      const confidence = confidenceFor(row.fits, rows.length, scored.filter((item) => item.fits === bestFit).length);
      hypotheses.push({
        id: `${functionName}_${index}`,
        summary: `${functionName} returns \`${target.returnExpr}\` but evidence fits \`${row.expr}\``,
        confidence,
        evidence: [
          `function ${functionName} in ${target.path}`,
          `current return ${target.returnExpr}`,
          ...rows.map((item) => `${functionName}(${formatArgs(item.input)}) → ${fmt(item.actual)} (expected ${fmt(item.expected)})`),
        ],
        suggestedExpr: row.expr,
        replaceFrom: target.returnExpr,
        replaceTo: row.expr,
        targetFunction: functionName,
        targetFile: target.path,
      });
    }
  }

  const stringFix = diagnoseLiteralMismatch(input);
  if (stringFix) hypotheses.unshift(stringFix);

  if (hypotheses.length === 0 && input.observations.some((item) => !item.passed)) {
    hypotheses.push({
      id: "unknown",
      summary: "Behavior mismatch observed but no unique source transform was proven",
      confidence: "LOW",
      evidence: input.observations.filter((item) => !item.passed).map((item) => item.name),
    });
  }

  return hypotheses;
}

function diagnoseLiteralMismatch(input: {
  description: string;
  files: Record<string, string>;
}): Hypothesis | null {
  const expectedMatch = input.description.match(/expected(?: label)? ["“]([^"”]+)["”]/i);
  const actualMatch = input.description.match(/got ["“]([^"”]+)["”]/i);
  if (!expectedMatch?.[1] || !actualMatch?.[1]) return null;
  const expected = expectedMatch[1];
  const actual = actualMatch[1];
  for (const [path, source] of Object.entries(input.files)) {
    if (source.includes(actual) && !source.includes(expected)) {
      return {
        id: "literal_mismatch",
        summary: `UI/copy mismatch in ${path}: "${actual}" should be "${expected}"`,
        confidence: "HIGH",
        evidence: [`${path} contains "${actual}"`, `report expects "${expected}"`],
        replaceFrom: actual,
        replaceTo: expected,
        targetFile: path,
      };
    }
  }
  return null;
}

export function applyHypothesis(source: string, hypothesis: Hypothesis): string | null {
  if (hypothesis.replaceFrom && hypothesis.replaceTo && hypothesis.id === "literal_mismatch") {
    if (!source.includes(hypothesis.replaceFrom)) return null;
    return source.replace(hypothesis.replaceFrom, hypothesis.replaceTo);
  }
  if (!hypothesis.targetFunction || !hypothesis.suggestedExpr) return null;
  const current = extractFunction(source, hypothesis.targetFunction);
  if (!current) return null;
  return source.replace(
    new RegExp(`((?:export\\s+)?function\\s+${hypothesis.targetFunction}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\s*\\{\\s*return\\s+)${escapeRegExp(current.returnExpr)}(;)`),
    `$1${hypothesis.suggestedExpr}$2`,
  );
}

function proposeExpressions(params: string[], rows: Observation[]): string[] {
  const exprs: string[] = [];
  if (params.length === 2) {
    const [a, b] = params;
    exprs.push(`${a} + ${b}`, `${a} - ${b}`, `${b} - ${a}`, `${a} * ${b}`);
  }
  if (params.length === 1) {
    const n = params[0]!;
    const numeric = rows
      .map((row) => ({ x: Number(row.input[0]), y: Number(row.expected) }))
      .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y));
    for (const pair of numeric) {
      exprs.push(`${n} + ${pair.y - pair.x}`);
      exprs.push(`${n} - ${pair.x - pair.y}`);
      if (pair.x !== 0 && Number.isInteger(pair.y / pair.x)) {
        exprs.push(`${n} * ${pair.y / pair.x}`);
      }
    }
    for (let k = -6; k <= 6; k += 1) {
      if (k === 0) continue;
      for (let c = -6; c <= 6; c += 1) {
        exprs.push(`${n} * ${k} + ${c}`);
        exprs.push(`${n} * ${k} - ${c}`);
      }
    }
  }
  return exprs;
}

function evaluateCandidate(expr: string, params: string[], args: unknown[]): unknown {
  const source = `export function _cand(${params.join(", ")}) { return ${expr}; }`;
  return executeExportedFunction(source, "_cand", args);
}

function confidenceFor(fits: number, total: number, ties: number): Confidence {
  if (fits === total && ties === 1) return "HIGH";
  if (fits === total) return "MEDIUM";
  return "LOW";
}

function exprComplexity(expr: string): number {
  return expr.length + (expr.includes("*") ? 2 : 0) + (expr.match(/[+-]/g)?.length ?? 0);
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const group = key(item);
    const list = map.get(group) ?? [];
    list.push(item);
    map.set(group, list);
  }
  return map;
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.replace(/\s+/g, " ").trim()))];
}

function formatArgs(args: unknown[]): string {
  return args.map((arg) => fmt(arg)).join(", ");
}

function fmt(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  return String(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
