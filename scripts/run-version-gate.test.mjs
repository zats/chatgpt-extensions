import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertLauncherResult,
  createGateEnvironment,
  parseStartCommand,
  safeFailure,
  safeRichProbeReadiness,
  summarizeLauncherResult,
} from "./run-version-gate.mjs";

function completeRichProbeReadiness() {
  return {
    stage: "interacted",
    mounted: true,
    registrations: {
      assistantDirective: true,
      assistantContentReference: true,
      assistantCodeBlock: true,
      conversationItem: true,
    },
    owners: {
      assistantDirective: true,
      assistantContentReference: true,
      assistantMarkdown: true,
      assistantCodeBlock: true,
      localConversationItem: true,
      cloudConversationItem: true,
      driftFree: true,
      cloudOwnerReady: true,
    },
    fallbacks: {
      assistantDirective: true,
      assistantContentReference: true,
      assistantCodeBlock: true,
      conversationItemLocal: true,
      conversationItemCloud: true,
    },
    interactions: {
      directive: true,
      directiveContainer: true,
      contentReference: true,
      codeBlock: true,
      streamingCodeBlock: true,
      conversationItem: true,
      groupedConversationItem: true,
      cloudConversationItem: true,
    },
  };
}

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
      assertLauncherResult(
        {
          ...passed,
          gates: passed.gates.filter(
            ({ name }) => name !== "native-main-live-probe",
          ),
        },
        { activationGates: ["activation:one:main", "activation:one:renderer"] },
      ),
    /native-main-live-probe/,
  );
  assert.throws(() => assertLauncherResult({ status: "failed", gates: [] }), /did not report/);
  assert.throws(
    () =>
      assertLauncherResult(
        {
          ...passed,
          gates: passed.gates.filter(
            ({ name }) => name !== "product-extension-live-interactions",
          ),
        },
        { activationGates: ["activation:one:main", "activation:one:renderer"] },
      ),
    /product-extension-live-interactions/,
  );
  assert.throws(
    () =>
      assertLauncherResult(
        {
          ...passed,
          gates: passed.gates.filter(
            ({ name }) => name !== "product-extension-real-ui-interactions",
          ),
        },
        { activationGates: ["activation:one:main", "activation:one:renderer"] },
      ),
    /product-extension-real-ui-interactions/,
  );
  assert.throws(
    () =>
      assertLauncherResult(
        {
          ...passed,
          gates: passed.gates.filter(({ name }) => name !== "stock-profile-warmup"),
        },
        { activationGates: ["activation:one:main", "activation:one:renderer"] },
      ),
    /stock-profile-warmup/,
  );
  assert.throws(
    () =>
      assertLauncherResult(
        {
          ...passed,
          gates: passed.gates.filter(
            ({ name }) => name !== "deterministic-thread-fixture",
          ),
        },
        { activationGates: ["activation:one:main", "activation:one:renderer"] },
      ),
    /deterministic-thread-fixture/,
  );
  assert.throws(
    () =>
      assertLauncherResult(passed, {
        activationGates: ["activation:one:main", "activation:one:renderer"],
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
        { activationGates: ["activation:one:main", "activation:one:renderer"] },
      ),
    /activation:one:main/,
  );
  assert.throws(
    () =>
      assertLauncherResult(
        {
          ...passed,
          gates: [
            ...passed.gates,
            {
              name: "unknown-gate",
              status: "passed",
              evidence: { title: "PrivateThreadTitle123" },
            },
          ],
        },
        { activationGates: ["activation:one:main", "activation:one:renderer"] },
      ),
    /invalid gate/,
  );
});

test("rich probe readiness accepts only the exact public boolean shape", () => {
  const readiness = completeRichProbeReadiness();
  assert.deepEqual(safeRichProbeReadiness(readiness), readiness);
  assert.equal(
    safeRichProbeReadiness({ ...readiness, stage: "private-stage" }),
    undefined,
  );
  assert.equal(
    safeRichProbeReadiness({
      ...readiness,
      interactions: { ...readiness.interactions, directive: "true" },
    }),
    undefined,
  );
  assert.equal(
    safeRichProbeReadiness({ ...readiness, privateThreadTitle: "private" }),
    undefined,
  );
  assert.equal(
    safeRichProbeReadiness({
      ...readiness,
      owners: { ...readiness.owners, privateAccount: false },
    }),
    undefined,
  );
});

test("public version-gate output strips launcher evidence and private error names", () => {
  const privateValue = "PrivateThreadTitle123";
  const value = summarizeLauncherResult(
    {
      status: "failed",
      gates: [
        {
          name: "exact-binding",
          status: "passed",
          evidence: { title: privateValue, url: privateValue },
        },
        {
          name: "activation:one:renderer",
          status: "failed",
          failure: { message: privateValue },
        },
        {
          name: "unknown-gate",
          status: "failed",
          evidence: { selectedText: privateValue },
        },
      ],
      failure: {
        code: privateValue,
        name: privateValue,
        message: privateValue,
      },
      runtimeEventCounts: {
        "rich-content-probe-skipped": 2,
        "renderer-injected": -1,
        [privateValue]: 99,
      },
      richEventSequence: [
        "extension.activate",
        privateValue,
        "code-block.mount",
      ],
      richProbeReadiness: completeRichProbeReadiness(),
      extra: privateValue,
    },
    { activationGates: ["activation:one:renderer"] },
  );
  assert.deepEqual(value, {
    status: "failed",
    gates: [
      { name: "exact-binding", status: "passed" },
      { name: "activation:one:renderer", status: "failed" },
    ],
    failure: { code: "launcher-gate-failed", errorName: "Error" },
    runtimeEventCounts: { "rich-content-probe-skipped": 2 },
    richEventSequence: ["extension.activate", "code-block.mount"],
    richProbeReadiness: completeRichProbeReadiness(),
  });
  assert.doesNotMatch(JSON.stringify(value), new RegExp(privateValue));
  assert.deepEqual(safeFailure("live", { name: privateValue }), {
    code: "live-gate-failed",
    errorName: "Error",
  });
  assert.equal(
    summarizeLauncherResult({
      status: "failed",
      failure: { code: "run-gate", errorName: "TypeError" },
    }).failure.errorName,
    "TypeError",
  );
  assert.deepEqual(
    summarizeLauncherResult({
      status: "failed",
      failure: {
        code: "ui-surface-live-interactions",
        errorName: "TimeoutError",
        message: privateValue,
      },
    }).failure,
    {
      code: "ui-surface-live-interactions",
      errorName: "TimeoutError",
    },
  );
});

test("the process-level public artifact strips private child fields on success and failure", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "version-gate-privacy."));
  const app = path.join(root, "ChatGPT.app");
  const binding = path.join(root, "binding");
  const codexHome = path.join(root, "codex-home");
  const extension = path.join(root, "extension");
  const privateValue = "PrivateThreadTitle123";
  const manifest = {
    version: "26.1.2",
    appBuild: "100",
    appAsarSha256: "a".repeat(64),
    downloadLength: 123456,
    downloadEdSignature: Buffer.alloc(64, 3).toString("base64"),
  };
  try {
    for (const directory of [app, binding, codexHome, extension]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(
      path.join(binding, "manifest.json"),
      `${JSON.stringify(manifest)}\n`,
    );
    fs.writeFileSync(path.join(codexHome, "auth.json"), "{}\n", {
      mode: 0o600,
    });
    fs.writeFileSync(
      path.join(extension, "package.json"),
      `${JSON.stringify({
        id: "one",
        chatgptx: { renderer: "renderer.cjs" },
      })}\n`,
    );

    for (const expectedStatus of ["passed", "failed"]) {
      const mock = path.join(root, `mock-${expectedStatus}.mjs`);
      const result = path.join(root, `public-${expectedStatus}.json`);
      fs.writeFileSync(
        mock,
        `import fs from "node:fs";
const arguments_ = process.argv.slice(2);
const resultFile = arguments_[arguments_.indexOf("--result") + 1];
const privateValue = ${JSON.stringify(privateValue)};
const exact = {
  name: "exact-binding",
  status: "passed",
  evidence: {
    appVersion: "26.1.2",
    appBuild: "100",
    appAsarSha256: "${"a".repeat(64)}",
    downloadLength: 123456,
    downloadEdSignature: ${JSON.stringify(manifest.downloadEdSignature)},
    bindingManifestSha256: "${"b".repeat(64)}",
    title: privateValue,
  },
};
const interaction = (name) => ({
  name,
  status: "passed",
  evidence: { title: privateValue, selectedText: privateValue },
});
const passed = {
  status: "passed",
  gates: [
    { name: "stock-profile-warmup", status: "passed", evidence: { initializedState: true, stopped: true, title: privateValue } },
    { name: "deterministic-thread-fixture", status: "passed", evidence: { count: 2, threadIds: [privateValue] } },
    exact,
    { name: "activation:one:renderer", status: "passed", evidence: { title: privateValue } },
    interaction("native-main-live-probe"),
    interaction("rich-message-live-interactions"),
    interaction("ui-surface-live-interactions"),
    interaction("product-extension-live-interactions"),
    interaction("product-extension-real-ui-interactions"),
    { name: "no-runtime-failures", status: "passed" },
  ],
  extra: privateValue,
};
const failed = {
  status: "failed",
  gates: [
    exact,
    { name: "unknown-gate", status: "failed", evidence: { title: privateValue } },
  ],
  failure: { code: privateValue, errorName: privateValue, message: privateValue },
  richProbeReadiness: ${JSON.stringify(completeRichProbeReadiness())},
  extra: privateValue,
};
fs.writeFileSync(resultFile, JSON.stringify(${JSON.stringify(expectedStatus)} === "passed" ? passed : failed));
if (${JSON.stringify(expectedStatus)} === "failed") process.exitCode = 1;
`,
      );
      const command = spawnSync(
        process.execPath,
        [
          new URL("./run-version-gate.mjs", import.meta.url).pathname,
          "--phase",
          "live",
          "--app",
          app,
          "--binding",
          binding,
          "--codex-home",
          codexHome,
          "--extension",
          extension,
          "--result",
          result,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            CHATGPT_START_COMMAND: JSON.stringify([process.execPath, mock]),
          },
        },
      );
      assert.equal(command.status, expectedStatus === "passed" ? 0 : 1);
      const serialized = fs.readFileSync(result, "utf8");
      assert.doesNotMatch(serialized, new RegExp(privateValue));
      const parsed = JSON.parse(serialized);
      assert.equal(parsed.status, expectedStatus);
      assert.deepEqual(
        parsed.launcher?.richProbeReadiness,
        expectedStatus === "failed" ? completeRichProbeReadiness() : undefined,
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
