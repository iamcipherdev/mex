import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { flushGraphPhaseTimings, recordGraphPhase } from "../phase-timing.js";

const ENV = "MEX_GRAPH_PHASE_TIMINGS";

function withEnv(value: string | undefined, run: () => void): void {
  const previous = process.env[ENV];
  if (value === undefined) delete process.env[ENV];
  else process.env[ENV] = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env[ENV];
    else process.env[ENV] = previous;
  }
}

describe("phase timing file resolution (#291)", () => {
  it("flag-style value 1 writes to .mex/local/phase-timings.jsonl, not a file named 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "mex-phase-"));
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      withEnv("1", () => {
        recordGraphPhase("index", 1.5);
        flushGraphPhaseTimings("test");
      });
      expect(existsSync(join(dir, "1"))).toBe(false);
      const file = join(dir, ".mex", "local", "phase-timings.jsonl");
      expect(existsSync(file)).toBe(true);
      const record = JSON.parse(readFileSync(file, "utf8").trim());
      expect(record.label).toBe("test");
      expect(record.phases).toEqual({ index: 1.5 });
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("flag-style value true resolves the same default file", () => {
    const dir = mkdtempSync(join(tmpdir(), "mex-phase-"));
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      withEnv("true", () => {
        recordGraphPhase("plan", 2);
        flushGraphPhaseTimings("test");
      });
      expect(existsSync(join(dir, "true"))).toBe(false);
      expect(existsSync(join(dir, ".mex", "local", "phase-timings.jsonl"))).toBe(true);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an explicit path keeps the previous behaviour", () => {
    const dir = mkdtempSync(join(tmpdir(), "mex-phase-"));
    const file = join(dir, "custom-timings.jsonl");
    try {
      withEnv(file, () => {
        recordGraphPhase("index", 3);
        flushGraphPhaseTimings("test");
      });
      expect(readFileSync(file, "utf8")).toContain('"index":3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("an unset env var clears totals without writing anything", () => {
    const dir = mkdtempSync(join(tmpdir(), "mex-phase-"));
    try {
      withEnv(undefined, () => {
        recordGraphPhase("index", 1);
        flushGraphPhaseTimings("test");
      });
      expect(readdirSync(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
