import assert from "node:assert/strict";
import test from "node:test";

import { shouldRetryTransientFailure } from "./retry-transient-rebind-failure.mjs";

test("only bounded runner or service failures retry", () => {
  const run = { conclusion: "failure", run_attempt: 1 };
  assert.equal(
    shouldRetryTransientFailure(run, [{}], [
      {
        annotation_level: "failure",
        message: "The hosted runner lost communication with the server.",
      },
    ]),
    true,
  );
  assert.equal(
    shouldRetryTransientFailure(run, [{}], [
      { annotation_level: "failure", message: "A product validation test failed" },
    ]),
    false,
  );
  assert.equal(
    shouldRetryTransientFailure({ ...run, run_attempt: 2 }, [{}], [
      {
        annotation_level: "failure",
        message: "The hosted runner lost communication with the server.",
      },
    ]),
    false,
  );
  assert.equal(
    shouldRetryTransientFailure({ conclusion: "cancelled", run_attempt: 1 }, [], []),
    false,
  );
});

test("GitHub startup and stale conclusions retry once without log inspection", () => {
  assert.equal(
    shouldRetryTransientFailure({ conclusion: "startup_failure", run_attempt: 1 }, [], []),
    true,
  );
  assert.equal(
    shouldRetryTransientFailure({ conclusion: "stale", run_attempt: 1 }, [], []),
    true,
  );
});

test("a tested patch on a stale base gets one fresh-base retry without rebasing", () => {
  const run = { conclusion: "failure", run_attempt: 1 };
  assert.equal(
    shouldRetryTransientFailure(run, [{}], [
      {
        annotation_level: "failure",
        message: "chatgpt-rebind-fresh-base-required",
      },
    ]),
    true,
  );
  assert.equal(
    shouldRetryTransientFailure(run, [{}], [
      {
        annotation_level: "failure",
        message: "product test asks for a fresh base",
      },
    ]),
    false,
  );
});
