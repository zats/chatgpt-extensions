#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const transientAnnotation =
  /(?:hosted runner lost communication|runner (?:has )?received a shutdown signal|internal runner error|github actions service unavailable)/i;
const runnerTerminationAnnotation = "Process completed with exit code 143.";
const freshBaseAnnotation = /^chatgpt-rebind-fresh-base-required$/;

export function shouldRetryTransientFailure(run, jobs, annotations) {
  if (
    !run ||
    !["failure", "startup_failure", "stale"].includes(run.conclusion) ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt >= 2 ||
    !Array.isArray(jobs) ||
    !Array.isArray(annotations)
  ) {
    return false;
  }
  if (["startup_failure", "stale"].includes(run.conclusion)) return true;
  return annotations.some(
    (annotation) =>
      annotation?.annotation_level === "failure" &&
      (transientAnnotation.test(annotation.message ?? "") ||
        annotation.message === runnerTerminationAnnotation ||
        freshBaseAnnotation.test(annotation.message ?? "")),
  );
}

async function main() {
  const [runFile, jobsFile, annotationsFile] = process.argv.slice(2);
  if (!runFile || !jobsFile || !annotationsFile) {
    throw new Error(
      "usage: retry-transient-rebind-failure.mjs <run.json> <jobs.json> <annotations.json>",
    );
  }
  const run = JSON.parse(await readFile(runFile, "utf8"));
  const jobsValue = JSON.parse(await readFile(jobsFile, "utf8"));
  const annotations = JSON.parse(await readFile(annotationsFile, "utf8"));
  process.stdout.write(
    `${shouldRetryTransientFailure(run, jobsValue.jobs ?? jobsValue, annotations) ? "retry" : "ignore"}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
