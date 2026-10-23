import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Opt-in per-phase wall-clock timing for graph maintenance.
 *
 * Enabled by `MEX_GRAPH_PHASE_TIMINGS`. An explicit file path is used as-is.
 * Flag-style values (`1`, `true`) write to a default file under
 * `.mex/local/` instead of creating a file literally named `1`. When enabled,
 * each flush appends one JSON line of accumulated phase totals to that file.
 * Nothing is ever printed, and no path or source content enters a record:
 * phase names are fixed labels and values are milliseconds or counts.
 */
const PHASE_TIMINGS_ENV = "MEX_GRAPH_PHASE_TIMINGS";
const PHASE_TIMINGS_DEFAULT_DIR = ".mex/local";
const PHASE_TIMINGS_DEFAULT_FILE = "phase-timings.jsonl";

const totals = new Map<string, number>();

function enabled(): boolean {
  return typeof process.env[PHASE_TIMINGS_ENV] === "string" && process.env[PHASE_TIMINGS_ENV] !== "";
}

/**
 * Resolve the file timings are appended to. Returns undefined when the env
 * var is unset or empty. Flag-style values (`1`, `true`) resolve to the
 * default file under `.mex/local/`; anything else is an explicit path.
 */
function resolveTimingsFile(): { file: string; isDefault: boolean } | undefined {
  const value = process.env[PHASE_TIMINGS_ENV];
  if (typeof value !== "string" || value === "") return undefined;
  if (value === "1" || value.toLowerCase() === "true") {
    return { file: join(PHASE_TIMINGS_DEFAULT_DIR, PHASE_TIMINGS_DEFAULT_FILE), isDefault: true };
  }
  return { file: value, isDefault: false };
}

export function recordGraphPhase(phase: string, milliseconds: number): void {
  if (!enabled()) return;
  totals.set(phase, (totals.get(phase) ?? 0) + milliseconds);
}

export function timeGraphPhase<T>(phase: string, run: () => T): T {
  if (!enabled()) return run();
  const started = performance.now();
  try {
    return run();
  } finally {
    recordGraphPhase(phase, performance.now() - started);
  }
}

export async function timeGraphPhaseAsync<T>(phase: string, run: () => Promise<T>): Promise<T> {
  if (!enabled()) return run();
  const started = performance.now();
  try {
    return await run();
  } finally {
    recordGraphPhase(phase, performance.now() - started);
  }
}

/** Append the accumulated totals under one fixed label, then reset them. */
export function flushGraphPhaseTimings(label: string): void {
  const resolved = resolveTimingsFile();
  if (resolved === undefined) {
    totals.clear();
    return;
  }
  const phases = Object.fromEntries([...totals.entries()].map(([phase, ms]) => [phase, Math.round(ms * 10) / 10]));
  totals.clear();
  try {
    if (resolved.isDefault) {
      mkdirSync(dirname(resolved.file), { recursive: true });
    }
    appendFileSync(resolved.file, `${JSON.stringify({ label, pid: process.pid, phases })}\n`);
  } catch {
    // Diagnostics must never change the outcome of a maintenance operation.
  }
}
