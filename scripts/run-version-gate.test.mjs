import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLauncherResult,
  createGateEnvironment,
  parseStartCommand,
} from "./run-version-gate.mjs";

test("default start command calls the repository start script with Node", () => {
  const result = parseStartCommand(undefined);
  assert.equal(result.executable, process.execPath);
  assert.match(result.prefix[0], /scripts\/start\.mjs$/);
});

test("start command override accepts an argument array without a shell", () => {
  const result = parseStartCommand('["/usr/bin/node","/tmp/mock.mjs"]');
  assert.equal(result.executable, "/usr/bin/node");
  assert.deepEqual(result.prefix, ["/tmp/mock.mjs"]);
  assert.throws(() => parseStartCommand("node /tmp/mock.mjs"), /one executable or a JSON/);
});

test("gate child environment omits runner channels and ambient credentials", () => {
  const environment = createGateEnvironment({
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "id-token",
    ACTIONS_RUNTIME_TOKEN: "runtime-token",
    CHATGPT_START_COMMAND: '["/usr/bin/node","/tmp/start.mjs"]',
    CI: "untrusted",
    GITHUB_ENV: "/tmp/github-env",
    GITHUB_PATH: "/tmp/github-path",
    HOME: "/tmp/gate-home",
    LANG: "en_US.UTF-8",
    NODE_OPTIONS: "--require=/tmp/poison.cjs",
    PATH: "/safe/bin:/usr/bin:/bin",
    RUNNER_TEMP: "/tmp/runner",
    TMPDIR: "/tmp/gate-tmp",
    USER: "gate",
  });
  assert.deepEqual(environment, {
    CHATGPT_START_COMMAND: '["/usr/bin/node","/tmp/start.mjs"]',
    CI: "1",
    HOME: "/tmp/gate-home",
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    NO_COLOR: "1",
    PATH: "/safe/bin:/usr/bin:/bin",
    TMPDIR: "/tmp/gate-tmp",
    USER: "gate",
    npm_config_audit: "false",
    npm_config_fund: "false",
  });
  for (const name of Object.keys(environment)) {
    assert.doesNotMatch(name, /^(?:ACTIONS|GITHUB|RUNNER)_/);
  }
});

test("launcher result requires exact binding, every activation phase, and live evidence", () => {
  const passed = {
    status: "passed",
    gates: [
      {
        name: "stock-profile-warmup",
        status: "passed",
        evidence: { profile: "isolated" },
      },
      {
        name: "deterministic-thread-fixture",
        status: "passed",
        evidence: { threads: 2 },
      },
      {
        name: "exact-binding",
        status: "passed",
        evidence: {
          appVersion: "26.1.2",
          appBuild: "100",
          appAsarSha256: "a".repeat(64),
          downloadLength: 123456,
          downloadEdSignature: Buffer.alloc(64, 3).toString("base64"),
          bindingManifestSha256: "b".repeat(64),
        },
      },
      { name: "activation:one:main", status: "passed" },
      { name: "activation:one:renderer", status: "passed" },
      {
        name: "native-main-live-probe",
        status: "passed",
        evidence: { status: "passed" },
      },
      {
        name: "rich-message-live-interactions",
        status: "passed",
        evidence: { interactions: 4 },
      },
      {
        name: "ui-surface-live-interactions",
        status: "passed",
        evidence: { interactions: 5 },
      },
      {
        name: "product-extension-live-interactions",
        status: "passed",
        evidence: { interactions: 6 },
      },
      {
        name: "product-extension-real-ui-interactions",
        status: "passed",
        evidence: { interactions: 7 },
      },
      { name: "no-runtime-failures", status: "passed" },
    ],
  };
  assert.equal(
    assertLauncherResult(passed, {
      activationGates: ["activation:one:main", "activation:one:renderer"],
      manifest: {
        version: "26.1.2",
        appBuild: "100",
        appAsarSha256: "a".repeat(64),
        downloadLength: 123456,
        downloadEdSignature: Buffer.alloc(64, 3).toString("base64"),
      },
    }),
    passed,
  );
  assert.throws(
    () =>
      assertLauncherResult({
        status: "passed",
        gates: [{ name: "exact-binding", status: "passed" }],
      }),
    /rich-message-live-interactions/,
  );
  assert.throws(
    () =>
      assertLauncherResult({
        ...passed,
        gates: passed.gates.filter(
          ({ name }) => name !== "native-main-live-probe",
        ),
      }),
    /native-main-live-probe/,
  );
  assert.throws(() => assertLauncherResult({ status: "failed", gates: [] }), /did not report/);
  assert.throws(
    () =>
      assertLauncherResult({
        ...passed,
        gates: passed.gates.filter(
          ({ name }) => name !== "product-extension-live-interactions",
        ),
      }),
    /product-extension-live-interactions/,
  );
  assert.throws(
    () =>
      assertLauncherResult({
        ...passed,
        gates: passed.gates.filter(
          ({ name }) => name !== "product-extension-real-ui-interactions",
        ),
      }),
    /product-extension-real-ui-interactions/,
  );
  assert.throws(
    () =>
      assertLauncherResult({
        ...passed,
        gates: passed.gates.filter(({ name }) => name !== "stock-profile-warmup"),
      }),
    /stock-profile-warmup/,
  );
  assert.throws(
    () =>
      assertLauncherResult({
        ...passed,
        gates: passed.gates.filter(
          ({ name }) => name !== "deterministic-thread-fixture",
        ),
      }),
    /deterministic-thread-fixture/,
  );
  assert.throws(
    () =>
      assertLauncherResult(passed, {
        manifest: {
          version: "26.1.2",
          appBuild: "100",
          appAsarSha256: "a".repeat(64),
          downloadLength: 654321,
          downloadEdSignature: Buffer.alloc(64, 3).toString("base64"),
        },
      }),
    /exact-binding evidence/,
  );
  assert.throws(
    () =>
      assertLauncherResult(
        {
          ...passed,
          gates: passed.gates.filter(({ name }) => name !== "activation:one:main"),
        },
        { activationGates: ["activation:one:main"] },
      ),
    /activation:one:main/,
  );
});
