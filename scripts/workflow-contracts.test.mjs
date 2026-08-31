import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const workflows = path.join(root, ".github", "workflows");

async function source(name) {
  return readFile(path.join(workflows, name), "utf8");
}

test("rebind starts from opened or reopened current issues and exact trusted retry", async () => {
  const value = await source("rebind-chatgpt.yml");
  assert.match(value, /issues:\s*\n\s+types:\s*\n\s+- opened\s*\n\s+- reopened/);
  assert.doesNotMatch(value, /\n\s+- labeled\s*\n/);
  assert.match(value, /endsWith\(github\.event\.issue\.title, ' binding \[current\]'\)/);
  assert.match(value, /github\.event\.issue\.user\.login == github\.repository_owner/);
  assert.match(value, /contains\(github\.event\.issue\.labels\.\*\.name, 'chatgpt-binding'\)/);
  assert.match(value, /contains\(github\.event\.issue\.labels\.\*\.name, 'pending'\)/);
  assert.match(value, /github\.event\.comment\.body == 'retry'/);
  assert.match(value, /"OWNER","MEMBER","COLLABORATOR"/);
  assert.match(value, /cancel-in-progress: false/);
  assert.match(
    value,
    /github\.event\.issue\.number \|\| github\.event\.client_payload\.issueNumber \|\| inputs\.issue_number/,
  );
});

test("public issue comments are filtered before Node buffers them", async () => {
  const value = await readFile(path.join(root, "scripts/trigger-chatgpt-rebind.mjs"), "utf8");
  const start = value.indexOf("function issueComments");
  const end = value.indexOf("function setIssueStatus", start);
  const implementation = value.slice(start, end);
  assert.match(implementation, /--paginate/);
  assert.match(implementation, /--jq/);
  assert.match(implementation, /github-actions\[bot\]/);
  assert.doesNotMatch(implementation, /--slurp/);
});

test("all external actions use immutable commit SHAs", async () => {
  for (const name of await readdir(workflows)) {
    if (!name.endsWith(".yml")) continue;
    const value = await source(name);
    for (const match of value.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
      const reference = match[1];
      if (reference.startsWith("./")) continue;
      assert.match(reference, /@[a-f0-9]{40}$/, `${name}: ${reference}`);
    }
  }
});

test("first binding commit follows sanitized static and isolated live gates", async () => {
  const value = await source("rebind-chatgpt.yml");
  const cleanPatch = value.indexOf(
    "Scan, reproduce, and validate the decrypted uncommitted patch",
  );
  const staticGate = value.indexOf(
    "Run the no-secret static gate before any test authentication",
  );
  const liveGate = value.indexOf(
    "Run the isolated direct stock gate before the first commit",
  );
  const commit = value.indexOf("Create the first commit without rebasing");
  assert.ok(
    cleanPatch >= 0 &&
      staticGate > cleanPatch &&
      liveGate > staticGate &&
      commit > liveGate,
    "the sanitized patch, no-secret static gate, and isolated live gate must precede the first commit",
  );
  assert.doesNotMatch(value, /git rebase/);
  assert.match(value, /Main changed after the uncommitted gate; refusing to rebase tested files/);
  assert.match(value, /artifact_base.*BASE_SHA/);
});

test("every live job builds all required extension inputs before authentication", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const reusable = await source("test.yml");
  const required = [
    "extensions/extensions",
    "extensions/reactions",
    "extensions/thread-colors",
    "test-fixtures/native-main-probe",
    "test-fixtures/ui-surface-probe",
    "test-fixtures/rich-message-probe",
  ];
  const liveBuildList = (value, start, end) => {
    const startIndex = value.indexOf(start);
    const endIndex = end ? value.indexOf(end, startIndex) : value.length;
    assert.ok(startIndex >= 0 && endIndex > startIndex);
    const job = value.slice(startIndex, endIndex);
    const buildStart = job.indexOf(
      "Build only the trusted live-gate inputs before authentication exists",
    );
    const buildEnd = job.indexOf("Materialize", buildStart);
    assert.ok(buildStart >= 0 && buildEnd > buildStart);
    return job.slice(buildStart, buildEnd);
  };
  const buildLists = [
    liveBuildList(
      rebind,
      "\n  precommit-validation:\n",
      "\n  refresh-precommit-test-auth:\n",
    ),
    liveBuildList(reusable, "\n  live:\n", ""),
  ];
  for (const build of buildLists) {
    assert.notEqual(build, "");
    for (const directory of required) assert.match(build, new RegExp(directory));
  }
});

test("generation uploads only encrypted bytes before separate trusted sanitization", async () => {
  const value = await source("rebind-chatgpt.yml");
  const generated = value.indexOf("name: Generate an uncommitted exact binding");
  const terminate = value.indexOf("name: Terminate and verify every untrusted process", generated);
  const patch = value.indexOf("name: Capture one raw untrusted patch", terminate);
  const terminateCapture = value.indexOf(
    "name: Terminate and verify every capture process",
    patch,
  );
  const encrypt = value.indexOf(
    "name: Encrypt the raw patch for the trusted sanitizer",
    terminateCapture,
  );
  const upload = value.indexOf("name: Upload only the encrypted untrusted patch", encrypt);
  const sanitizer = value.indexOf("  sanitize-generated-patch:", upload);
  const scan = value.indexOf(
    'node "$RUNNER_TEMP/trusted-sanitizer/scan-patch-credentials.mjs"',
    sanitizer,
  );
  const apply = value.indexOf('git apply --index "$raw_patch"', scan);
  const validator = value.indexOf(
    'node "$RUNNER_TEMP/trusted-sanitizer/validate-binding-change.mjs"',
    apply,
  );
  assert.ok(
    generated >= 0 &&
      terminate > generated &&
      patch > terminate &&
      terminateCapture > patch &&
      encrypt > terminateCapture &&
      upload > encrypt &&
      sanitizer > upload &&
      scan > sanitizer &&
      apply > scan &&
      validator > apply,
    "the agent must stop before capture, plaintext must be encrypted before upload, and a separate trusted job must scan before apply and validation",
  );
  assert.match(
    value,
    /sudo -u "\$AGENT_USER" \/usr\/bin\/env -i[\s\S]*\/usr\/bin\/git -C "\$UNTRUSTED_WORKTREE"/,
  );
  assert.match(
    value,
    /codex-agent-sanitize CHATGPT_BINDING_PATCH patch/,
  );
  assert.match(value, /environment: codex-agent-refresh/);
  assert.doesNotMatch(
    value.slice(generated, sanitizer),
    /path:\s*\$\{\{[^\n]*binding\.patch/,
  );
  assert.match(value, /echo "node-bin=\$node_dir"/);
  assert.match(value, /NODE_BIN: \$\{\{ steps\.codex\.outputs\.node-bin \}\}/);
  assert.match(
    value,
    /PATH="\$CODEX_BIN:\$NODE_BIN:\/usr\/bin:\/bin:\/usr\/sbin:\/sbin"/,
  );
  const captureTermination = value.slice(
    value.indexOf("id: terminate-capture"),
    value.indexOf("name: Encrypt the raw patch for the trusted sanitizer"),
  );
  assert.match(captureTermination, /steps\.isolation\.outcome == 'success'/);
  assert.match(captureTermination, /steps\.terminate-agent\.outcome == 'success'/);
  assert.doesNotMatch(captureTermination, /steps\.raw-patch\.outcome == 'success'/);
  const authHandoff = value.slice(
    value.indexOf("id: agent-auth-handoff"),
    value.indexOf("name: Upload encrypted agent authentication handoff"),
  );
  assert.match(authHandoff, /steps\.terminate-capture\.outcome == 'success'/);
  assert.doesNotMatch(authHandoff, /steps\.raw-patch\.outcome == 'success'/);
});

test("backtest uses one appcast snapshot and exact offsets", async () => {
  const value = await source("backtest-chatgpt.yml");
  assert.match(value, /resolve-appcast-versions\.mjs/);
  assert.match(value, /--offsets "0,2,4"/);
  assert.doesNotMatch(value, /inputs:\s*\n\s+offsets:/);
  assert.match(value, /trigger-chatgpt-rebind\.mjs batch/);
  assert.match(value, /Create the frozen queue and dispatch its first backtest/);
  assert.doesNotMatch(value, /timeout-seconds/);
});

test("workflows contain no ChatGPTX launcher path", async () => {
  for (const name of await readdir(workflows)) {
    if (!name.endsWith(".yml")) continue;
    const value = await source(name);
    assert.doesNotMatch(value, /ChatGPTX\.app|Contents\/MacOS\/ChatGPTX|release-launcher/);
  }
});

test("directly invoked shell scripts are executable", async () => {
  for (const file of [
    "scripts/download-chatgpt-version.sh",
    "scripts/provision-auth-handoff.sh",
    "scripts/publish-binding-release.sh",
    "scripts/refresh-auth-handoff.sh",
    "scripts/run-isolated-live-gate.sh",
    ".agents/skills/rebind-chatgpt-version/scripts/extract-app.sh",
  ]) {
    const mode = (await stat(path.join(root, file))).mode;
    assert.notEqual(mode & 0o111, 0, `${file} must be executable`);
  }
});

test("privileged extraction uses only the root lock-pinned asar", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const extractor = await readFile(
    path.join(root, ".agents/skills/rebind-chatgpt-version/scripts/extract-app.sh"),
    "utf8",
  );
  const packageValue = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(packageValue.devDependencies["@electron/asar"], "4.2.1");
  assert.match(extractor, /\.\.\/\.\.\/\.\.\/\.\.\/node_modules\/\.bin\/asar/);
  assert.doesNotMatch(extractor, /npx|npm install/);
  assert.doesNotMatch(rebind, /npm ci --prefix \.agents/);
});

test("schema-2 feed identity reaches generation and every live gate", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const testWorkflow = await source("test.yml");
  assert.match(rebind, /DOWNLOAD_LENGTH: \$\{\{ needs\.request\.outputs\.download-length \}\}/);
  assert.match(rebind, /DOWNLOAD_ED_SIGNATURE: \$\{\{ needs\.request\.outputs\.download-ed-signature \}\}/);
  assert.match(testWorkflow, /DOWNLOAD_LENGTH: \$\{\{ inputs\.download_length \}\}/);
  assert.match(testWorkflow, /DOWNLOAD_ED_SIGNATURE: \$\{\{ inputs\.download_ed_signature \}\}/);
});

test("live credential refresh occurs between authenticated stages", async () => {
  const value = await source("rebind-chatgpt.yml");
  assert.match(value, /refresh-agent-auth:[\s\S]*precommit-validation:/);
  assert.match(value, /refresh-precommit-test-auth:[\s\S]*prepare-candidate:/);
  assert.match(value, /refresh-candidate-test-auth:[\s\S]*land:/);
  assert.match(value, /refresh-protected-test-auth:[\s\S]*publish:/);
  assert.match(value, /environment: chatgpt-test/);
  assert.match(value, /environment: codex-agent/);
});

test("each live gate has a unique immutable evidence and handoff identity", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const reusable = await source("test.yml");
  for (const identity of ["existing", "candidate", "protected", "promotion-protected"]) {
    assert.match(rebind, new RegExp(`auth_handoff_id: ${identity}`));
  }
  assert.match(
    reusable,
    /name: version-gate-\$\{\{ inputs\.auth_handoff_id \}\}-\$\{\{ inputs\.version \}\}/,
  );
  assert.match(reusable, /Every live gate requires a unique nonempty auth_handoff_id/);
  assert.match(rebind, /name: precommit-version-gate-/);
});

test("publication cleanup is idempotent and rescuer is scheduled", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const rescuer = await source("rescue-chatgpt-rebind.yml");
  assert.match(
    rebind,
    /name: Delete temporary candidate branch\s+continue-on-error: true/,
  );
  assert.match(rescuer, /schedule:/);
  assert.match(rescuer, /trigger-chatgpt-rebind\.mjs rescue/);
});

test("rerun consumers use producer artifact identities and authenticated attempts", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const backtest = await source("backtest-chatgpt.yml");
  const reusable = await source("test.yml");
  assert.match(
    rebind,
    /name: \$\{\{ needs\.generate\.outputs\.encrypted-patch-artifact-name \}\}/,
  );
  assert.match(
    rebind,
    /name: \$\{\{ needs\.sanitize-generated-patch\.outputs\.patch-artifact-name \}\}/,
  );
  assert.match(
    rebind,
    /source_run_attempt: \$\{\{ needs\.generate\.outputs\.artifact-run-attempt \}\}/,
  );
  assert.match(
    rebind,
    /source_run_attempt: \$\{\{ needs\.candidate-validation\.outputs\.auth_source_run_attempt \}\}/,
  );
  assert.match(
    backtest,
    /name: \$\{\{ needs\.resolve\.outputs\.snapshot-artifact-name \}\}/,
  );
  assert.match(reusable, /auth_source_run_attempt:/);
});

test("test authentication exists only after no-secret static tests and live runs as another UID", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const reusable = await source("test.yml");
  for (const value of [rebind, reusable]) {
    assert.doesNotMatch(value, /--phase all/);
    assert.match(value, /run-isolated-live-gate\.sh/);
    assert.match(value, /final-test-auth\.json/);
  }
  const staticJob = rebind.slice(
    rebind.indexOf("  precommit-static-validation:"),
    rebind.indexOf("  precommit-validation:"),
  );
  assert.match(staticJob, /--phase static/);
  assert.doesNotMatch(staticJob, /CHATGPT_TEST_AUTH_JSON|environment: chatgpt-test/);
  const liveJob = rebind.slice(
    rebind.indexOf("  precommit-validation:"),
    rebind.indexOf("  refresh-precommit-test-auth:"),
  );
  assert.doesNotMatch(liveJob, /npm test|--phase static/);
  assert.ok(
    liveJob.indexOf("Build only the trusted live-gate inputs before authentication exists") <
      liveJob.indexOf("Materialize only the dedicated test authentication"),
  );
  const reusableLive = reusable.slice(reusable.indexOf("  live:"));
  assert.ok(
    reusableLive.indexOf(
      "Build only the trusted live-gate inputs before authentication exists",
    ) < reusableLive.indexOf("Materialize private test authentication"),
  );
  const helper = await readFile(path.join(root, "scripts/run-isolated-live-gate.sh"), "utf8");
  assert.match(helper, /dscl \. -create/);
  assert.match(helper, /sudo -u "\$gate_user" \/usr\/bin\/env -i/);
  assert.match(helper, /pkill -KILL -u "\$gate_uid"/);
  assert.match(helper, /pgrep -u "\$gate_uid"/);
  assert.match(helper, /chown -R root:wheel "\$gate_home\/workspace"/);
  assert.match(helper, /unexpectedly has sudo access/);
});

test("job deadlines leave trusted cleanup time after each untrusted process bound", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const reusable = await source("test.yml");
  const generate = rebind.slice(rebind.indexOf("  generate:"), rebind.indexOf("  sanitize-generated-patch:"));
  const precommit = rebind.slice(
    rebind.indexOf("  precommit-validation:"),
    rebind.indexOf("  refresh-precommit-test-auth:"),
  );
  const live = reusable.slice(reusable.indexOf("  live:"));
  assert.match(generate, /timeout-minutes: 120/);
  assert.match(generate, /--timeout-ms 5400000/);
  assert.match(precommit, /timeout-minutes: 70/);
  assert.match(live, /timeout-minutes: 70/);
  const helper = await readFile(path.join(root, "scripts/run-isolated-live-gate.sh"), "utf8");
  assert.match(helper, /--timeout-ms 2700000/);
});

test("completed auth refresh finds prior-attempt artifacts on a failed-job rerun", async () => {
  const value = await source("refresh-completed-auth-handoffs.yml");
  assert.match(value, /head_branch == github\.event\.repository\.default_branch/);
  assert.match(value, /\{artifacts: \[ \.\[\] \| \.artifacts\[\] \]\}/);
  assert.doesNotMatch(value, /\.\[\]\[\] \| \.artifacts\[\]/);
  assert.match(value, /select\(\(\$match\.attempt \| tonumber\) <= \$maximum\)/);
  assert.match(value, /agent-source-attempt:/);
  assert.match(value, /test-source-attempt:/);
  assert.match(
    value,
    /source_run_attempt: \$\{\{ needs\.locate\.outputs\.agent-source-attempt \}\}/,
  );
  assert.match(
    value,
    /source_run_attempt: \$\{\{ needs\.locate\.outputs\.test-source-attempt \}\}/,
  );
});

test("recovery and existing publication run current automation against historical binding data", async () => {
  const value = await source("rebind-chatgpt.yml");
  assert.match(value, /validation_sha="\$base_sha"/);
  const existing = value.slice(value.indexOf("  existing-publish:"), value.indexOf("  prepare-promotion:"));
  const recovery = value.slice(value.indexOf("  recovery-publish:"), value.indexOf("  finalize:"));
  for (const job of [existing, recovery]) {
    assert.match(job, /ref: \$\{\{ needs\.request\.outputs\.base-sha \}\}/);
    assert.match(job, /(?:SOURCE_SHA|HEAD_SHA): \$\{\{ needs\.request\.outputs\.binding-source-sha \}\}/);
    assert.doesNotMatch(job, /ref: \$\{\{ needs\.request\.outputs\.binding-source-sha \}\}/);
  }
});

test("current promotion preserves the immutable binding source and gates the selector commit", async () => {
  const value = await source("rebind-chatgpt.yml");
  assert.match(value, /binding-source-sha:/);
  assert.match(value, /promotion: \$\{\{ steps\.claim\.outputs\.promotion \}\}/);
  assert.match(value, /prepare-promotion:[\s\S]*promotion-candidate-validation:/);
  assert.match(value, /require_current: true/);
  assert.match(value, /promotion-protected-validation:[\s\S]*live: true/);
  assert.match(value, /refresh-promotion-protected-test-auth:/);
  assert.match(value, /"\$VALIDATION_ONLY" == "true" && "\$PROMOTION" != "true"/);
  assert.match(value, /PROMOTION_LANDED_SHA/);
});

test("stale-main races request one bounded fresh-base run and never rebase", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const retry = await source("retry-transient-rebind.yml");
  assert.equal(
    [...rebind.matchAll(/chatgpt-rebind-fresh-base-required/g)].length,
    4,
  );
  assert.match(retry, /retry-transient-rebind-failure\.mjs/);
  assert.match(rebind, /"outcome=retrying"/);
  assert.match(rebind, /if: steps\.state\.outputs\.outcome == 'success'/);
  assert.match(rebind, /chatgpt-rebind-run-lineage-v1 \$GITHUB_RUN_ID \$automatic_parent/);
  assert.doesNotMatch(rebind, /git rebase/);
});

test("failed runs settle only after the bounded transient classifier", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const retry = await source("retry-transient-rebind.yml");
  assert.match(retry, /\{jobs: \[ \.\[\] \| \.jobs\[\] \]\}/);
  assert.doesNotMatch(retry, /\.\[\]\[\] \| \.jobs\[\]/);
  assert.doesNotMatch(retry, /run_attempt < 2/);
  assert.match(retry, /trigger-chatgpt-rebind\.mjs settle-failed/);
  assert.match(
    rebind,
    /Binding run failed and is waiting for the bounded transient-failure classifier/,
  );
  assert.match(rebind, /if: steps\.state\.outputs\.outcome == 'success'/);
  const trigger = await readFile(
    path.join(root, "scripts", "trigger-chatgpt-rebind.mjs"),
    "utf8",
  );
  assert.match(trigger, /async function settleFailedRun/);
  assert.match(trigger, /await continueBatch\(repository, match\.issue\.number, "failed"\)/);
  assert.match(trigger, /\["retry-transient", "settle-failed"\]/);
});

test("recovery success reports only the gates that recovery ran", async () => {
  const value = await source("rebind-chatgpt.yml");
  const match = value.match(/body="Recovered ChatGPT \$VERSION binding ([^"]+)"/);
  assert.ok(match);
  assert.match(match[1], /exact static and direct stock ChatGPT gate/);
  assert.match(match[1], /Immutable publication is complete and verified/);
  assert.doesNotMatch(match[1], /pre-commit|candidate|protected/);
});

test("correction accepts any existing target and preserves the current selector", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const correction = rebind.slice(
    rebind.indexOf("              correction)"),
    rebind.indexOf("              backtest)"),
  );
  assert.match(correction, /Correction mode requires the existing target binding/);
  assert.doesNotMatch(correction, /current_version|limited to the current/);
  assert.match(
    rebind,
    /In correction mode, replace only the existing target binding and its exact build documentation, preserve the current index selection unless the target is already current/,
  );
  assert.match(
    rebind,
    /if \[\[ "\$MODE" == "correction" \]\]; then\s+reference_version="\$VERSION"/,
  );
  const validator = await readFile(
    path.join(root, "scripts", "validate-binding-change.mjs"),
    "utf8",
  );
  assert.doesNotMatch(validator, /Correction mode is limited to the current ChatGPT binding/);
  assert.match(validator, /\$\{mode\} mode cannot change the current binding/);
  const skill = await readFile(
    path.join(root, ".agents", "skills", "rebind-chatgpt-version", "SKILL.md"),
    "utf8",
  );
  assert.match(skill, /`correction`: The target binding must exist\./);
  assert.match(skill, /Preserve `index\.current` unless the target is already current\./);
});
