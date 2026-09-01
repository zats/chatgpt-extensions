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

test("workflow YAML parsing uses the current Psych keyword API", async () => {
  const value = await source("test.yml");
  assert.match(
    value,
    /YAML\.safe_load\(File\.read\(file\), permitted_classes: \[\], permitted_symbols: \[\], aliases: true\)/,
  );
  assert.doesNotMatch(value, /YAML\.safe_load\(File\.read\(file\), \[\], \[\], true\)/);
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
  const agentRun = value.slice(generated, terminate);
  assert.match(
    agentRun,
    /jq -er \.current "\$GITHUB_WORKSPACE\/runtime\/bindings\/index\.json"/,
  );
  assert.doesNotMatch(
    agentRun,
    /jq -er \.current "\$UNTRUSTED_WORKTREE\/runtime\/bindings\/index\.json"/,
  );
  const terminateAgent = value.slice(terminate, patch);
  assert.match(terminateAgent, /for _ in 1 2 3 4 5 6 7 8 9 10; do/);
  assert.match(terminateAgent, /launchctl bootout "gui\/\$AGENT_UID"/);
  assert.match(terminateAgent, /launchctl bootout "user\/\$AGENT_UID"/);
  assert.match(terminateAgent, /pkill -KILL -u "\$AGENT_UID"/);
  assert.match(terminateAgent, /pgrep -u "\$AGENT_UID"/);
  assert.match(terminateAgent, /ps -o pid=,ppid=,stat=,comm= -U "\$AGENT_UID"/);
  const retrySeedApply = value.slice(
    value.indexOf('if [[ -n "$seed_patch" ]]'),
    value.indexOf("name: Generate an uncommitted exact binding"),
  );
  assert.match(
    retrySeedApply,
    /\/bin\/cat "\$seed_patch" \|[\s\S]*git -C "\$UNTRUSTED_WORKTREE" apply -/,
  );
  assert.doesNotMatch(retrySeedApply, /apply "\$seed_patch"/);
  const captureTermination = value.slice(
    value.indexOf("id: terminate-capture"),
    value.indexOf("name: Encrypt the raw patch for the trusted sanitizer"),
  );
  assert.match(captureTermination, /steps\.isolation\.outcome == 'success'/);
  assert.match(captureTermination, /steps\.terminate-agent\.outcome == 'success'/);
  assert.doesNotMatch(captureTermination, /steps\.raw-patch\.outcome == 'success'/);
  assert.match(captureTermination, /for _ in 1 2 3 4 5 6 7 8 9 10; do/);
  assert.match(captureTermination, /launchctl bootout "gui\/\$AGENT_UID"/);
  assert.match(captureTermination, /launchctl bootout "user\/\$AGENT_UID"/);
  assert.match(captureTermination, /pkill -KILL -u "\$AGENT_UID"/);
  assert.match(captureTermination, /pgrep -u "\$AGENT_UID"/);
  assert.match(
    captureTermination,
    /ps -o pid=,ppid=,stat=,comm= -U "\$AGENT_UID"/,
  );
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

test("isolated live gate copies source without Git metadata", async () => {
  const helper = await readFile(path.join(root, "scripts/run-isolated-live-gate.sh"), "utf8");
  assert.match(
    helper,
    /sudo \/usr\/bin\/rsync -a --exclude='\.git' "\$source_root\/" "\$gate_home\/workspace"/,
  );
  assert.doesNotMatch(helper, /\/usr\/bin\/ditto "\$source_root"/);
  assert.match(
    helper,
    /sudo \/usr\/bin\/ditto "\$app_source" "\$gate_home\/ChatGPT\.app"/,
  );
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

test("every authentication refresh caller grants the reusable workflow permissions", async () => {
  for (const name of await readdir(workflows)) {
    if (!name.endsWith(".yml") || name === "refresh-auth-handoff.yml") continue;
    const value = await source(name);
    const workflowPermissions = value
      .slice(0, value.indexOf("\njobs:\n"))
      .match(/^permissions:\n((?:  [^\n]+\n)+)/m)?.[1] ?? "";
    const jobStarts = [...value.matchAll(/^  [A-Za-z0-9_-]+:\s*$/gm)].map(
      ({ index }) => index,
    );
    for (const match of value.matchAll(
      /^    uses: \.\/\.github\/workflows\/refresh-auth-handoff\.yml$/gm,
    )) {
      const jobStart = jobStarts.findLast((index) => index < match.index);
      const nextJob = jobStarts.find((index) => index > match.index);
      assert.notEqual(jobStart, undefined, `${name} refresh caller job`);
      const job = value.slice(jobStart, nextJob === undefined ? value.length : nextJob);
      const effectivePermissions = job.match(/\n    permissions:\n((?:      [^\n]+\n)+)/)?.[1]
        ?? workflowPermissions;
      assert.match(effectivePermissions, /actions: read/, `${name} refresh caller`);
      assert.match(effectivePermissions, /contents: read/, `${name} refresh caller`);
    }
  }
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
  assert.match(rescuer, /checks: read/);
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

test("a binding retry receives its prior public live failure and re-derives minified aliases", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const retry = rebind.slice(
    rebind.indexOf("name: Recover the exact trusted retry seed"),
    rebind.indexOf("name: Generate an uncommitted exact binding"),
  );
  assert.match(
    retry,
    /patch_attempt="\$\{patch_artifact_name##\*-\}"/,
  );
  assert.match(
    retry,
    /\[\[ "\$patch_attempt" =~ \^\[1-9\]\[0-9\]\*\$ \]\]/,
  );
  assert.match(
    retry,
    /precommit-version-gate-\$VERSION-\$PREVIOUS_RUN_ID-\$patch_attempt/,
  );
  assert.match(
    retry,
    /version-gate-candidate-\$VERSION-\$PREVIOUS_RUN_ID-\$patch_attempt/,
  );
  assert.match(
    retry,
    /\(\[\.artifacts\[\] \| select\(\.expired == false and \.name == \$candidate\)\] \| last\) \/\//,
  );
  assert.match(
    retry,
    /\(\[\.artifacts\[\] \| select\(\.expired == false and \.name == \$precommit\)\] \| last\) \/\//,
  );
  assert.match(retry, /printf '%s\\n' version-gate\.json/);
  assert.match(retry, /\.schemaVersion == 1/);
  assert.match(retry, /\.phase == "live"/);
  assert.match(retry, /scan-patch-credentials\.mjs/);
  assert.match(retry, /\$diagnostics\/version-gate\.json/);
  assert.match(retry, /historical-live-result=\$live_status/);
  assert.match(retry, /historical-live-stage=\$live_stage/);
  assert.match(
    rebind,
    /Re-derive every minified module and export from target-build behavior/,
  );
  assert.match(rebind, /case "\$RETRY_HISTORICAL_LIVE_RESULT" in/);
  assert.match(rebind, /historical \$RETRY_HISTORICAL_LIVE_STAGE live gate failed/);
  assert.match(rebind, /historical \$RETRY_HISTORICAL_LIVE_STAGE live gate passed/);
  assert.match(rebind, /This result does not validate or describe a different candidate or fresh seed/);
  assert.match(rebind, /No historical live-gate result is available/);
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
  assert.match(helper, /sysadminctl -addUser "\$gate_user"/);
  assert.match(helper, /sysadminctl -deleteUser "\$gate_user"/);
  assert.doesNotMatch(helper, /dscl \. -create/);
  assert.doesNotMatch(helper, /dscl \. -delete/);
  assert.match(helper, /must run as a normal administrator account/);
  assert.match(helper, /gate_uid="\$\(read_gate_uid\)"/);
  assert.match(helper, /chown "\$gate_uid:20" "\$gate_home"/);
  assert.match(helper, /chmod 555 "\$gate_home"/);
  assert.match(helper, /sudo -u "\$gate_user" \/usr\/bin\/env -i/);
  assert.match(helper, /\.chatgpt-extensions-isolated-live-gate/);
  assert.match(helper, /pkill -KILL -u "\$gate_uid"/);
  assert.match(helper, /launchctl bootout "user\/\$gate_uid"/);
  assert.match(helper, /launchctl bootout "gui\/\$gate_uid"/);
  assert.match(helper, /pgrep -u "\$gate_uid"/);
  assert.match(helper, /chown -R root:wheel "\$gate_home\/workspace"/);
  assert.match(
    helper,
    /chmod -R a\+rX "\$gate_home\/workspace" "\$gate_home\/ChatGPT\.app"/,
  );
  assert.match(
    helper,
    /chmod -R go-w "\$gate_home\/workspace" "\$gate_home\/ChatGPT\.app"/,
  );
  const readable = helper.indexOf('chmod -R a+rX "$gate_home/workspace"');
  const immutable = helper.indexOf('chmod -R go-w "$gate_home/workspace"');
  const launch = helper.indexOf('"$source_root/scripts/run-owned-command.mjs"');
  assert.ok(readable >= 0 && immutable > readable && launch > immutable);
  assert.match(helper, /unexpectedly has sudo access/);
  assert.match(helper, /unexpectedly belongs to the admin group/);
  assert.match(helper, /output_parent.*runner_temp/);
  assert.match(helper, /account or home already exists/);
  assert.match(helper, /sudo \/bin\/test -f/);
  assert.doesNotMatch(helper, /\/usr\/bin\/test/);
  const resultCopy = helper.indexOf('/bin/mv "$staged_result" "$result_output"');
  const normalCleanup = helper.lastIndexOf("trap - EXIT");
  const finalProcessCheck = helper.indexOf(
    "still has a process after its bounded stop",
  );
  const accountCheck = helper.indexOf("account still exists after cleanup", finalProcessCheck);
  const homeCheck = helper.indexOf("home still exists after cleanup", accountCheck);
  assert.ok(
    resultCopy >= 0 &&
      finalProcessCheck >= 0 &&
      accountCheck > finalProcessCheck &&
      homeCheck > accountCheck &&
      resultCopy > homeCheck &&
      normalCleanup > resultCopy,
  );
  const gateCompleted = helper.indexOf('gate_status="$?"');
  const suspended = helper.indexOf("\nsuspend_gate_processes\n", gateCompleted);
  const frozen = helper.indexOf('chflags uchg "$gate_result_source"', suspended);
  const staged = helper.indexOf('"$gate_result_source" "$staged_result"', frozen);
  const authValidated = helper.indexOf(
    "refreshed isolated authentication is not a JSON object",
    staged,
  );
  const accountDeleted = helper.indexOf("\ncleanup\n", staged);
  const authCopy = helper.indexOf('/bin/mv "$staged_auth" "$auth_output"');
  assert.ok(
    gateCompleted >= 0 &&
      suspended > gateCompleted &&
      frozen > suspended &&
      staged > frozen &&
      authValidated > staged &&
      accountDeleted > authValidated &&
      resultCopy > accountDeleted &&
      authCopy > accountDeleted,
  );
  assert.match(helper, /pkill -STOP -u "\$gate_uid"/);
  assert.ok(
    helper.indexOf('pgrep -u "$gate_uid"', helper.indexOf("suspend_gate_processes")) <
      helper.indexOf('ps -o stat= -U "$gate_uid"', helper.indexOf("suspend_gate_processes")),
  );
  assert.match(helper, /chflags nouchg "\$gate_result_source"/);
  assert.match(helper, /chflags nouchg "\$staged_result"/);
  assert.doesNotMatch(helper, /-adminPassword/);
  assert.match(helper, /ps -o pid=,ppid=,stat=,comm= -U "\$gate_uid"/);
  assert.ok(
    helper.indexOf("stop_gate_processes", helper.indexOf("sysadminctl -deleteUser")) >= 0,
  );
  assert.match(helper, /account_verified" != true && -e "\$gate_home"/);

  const generator = rebind.slice(
    rebind.indexOf("  generate:"),
    rebind.indexOf("  sanitize-generated-patch:"),
  );
  assert.match(generator, /sysadminctl -addUser "\$agent_user"/);
  assert.match(generator, /sysadminctl -deleteUser "\$AGENT_USER"/);
  assert.doesNotMatch(generator, /-adminPassword/);
  assert.doesNotMatch(generator, /dscl \. -create/);
  assert.doesNotMatch(generator, /dscl \. -delete/);
  assert.ok(
    generator.indexOf('echo "user=$agent_user"') <
      generator.indexOf('sysadminctl -addUser "$agent_user"'),
  );
  assert.match(generator, /unexpectedly belongs to the admin group/);
  assert.match(generator, /launchctl bootout "user\/\$cleanup_uid"/);
  assert.match(generator, /launchctl bootout "gui\/\$cleanup_uid"/);
  assert.match(generator, /stop_generator_processes \|\| cleanup_status=1/);
  assert.match(generator, /account still exists after cleanup/);
  assert.match(generator, /account still has a process after cleanup/);
  assert.match(generator, /home still exists after cleanup/);
  assert.doesNotMatch(generator, /\$AGENT_UID" -ge 600/);
  assert.equal(
    generator.match(/\$AGENT_UID" -ge 500/g)?.length,
    3,
    "all generator account guards must accept the sysadminctl UID range",
  );
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

test("the rebind run salvages prior-attempt authentication without a follower event", async () => {
  const value = await source("rebind-chatgpt.yml");
  const locate = value.slice(
    value.indexOf("  completed-auth-artifacts:"),
    value.indexOf("  refresh-completed-agent-auth:"),
  );
  assert.match(locate, /SOURCE_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(locate, /SOURCE_RUN_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(locate, /\{artifacts: \[ \.\[\] \| \.artifacts\[\] \]\}/);
  assert.doesNotMatch(locate, /\.\[\]\[\] \| \.artifacts\[\]/);
  assert.match(locate, /select\(\(\$match\.attempt \| tonumber\) <= \$maximum\)/);
  assert.match(locate, /\$attempt > 1 or/);
  assert.match(locate, /\.value\.result == "failure"/);
  assert.match(locate, /if \[\[ "\$salvage_required" == "true" \]\]; then/);
  assert.match(value, /refresh-completed-agent-auth:/);
  assert.match(value, /refresh-completed-test-auth:/);
  assert.match(value, /COMPLETED_ARTIFACT_RESULT:/);
  assert.match(value, /COMPLETED_SALVAGE_REQUIRED:/);
  assert.match(value, /salvage_success=true/);
  assert.match(value, /COMPLETED_ARTIFACT_RESULT" != "success/);
  assert.match(value, /COMPLETED_AGENT_REFRESH_RESULT/);
  assert.match(value, /COMPLETED_TEST_REFRESH_RESULT/);
  assert.match(
    value,
    /source_run_attempt: \$\{\{ needs\.completed-auth-artifacts\.outputs\.agent-source-attempt \}\}/,
  );
  assert.match(
    value,
    /source_run_attempt: \$\{\{ needs\.completed-auth-artifacts\.outputs\.test-source-attempt \}\}/,
  );
  const names = await readdir(workflows);
  assert.equal(names.includes("refresh-completed-auth-handoffs.yml"), false);
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
  assert.equal(
    [...rebind.matchAll(/chatgpt-rebind-fresh-base-required/g)].length,
    4,
  );
  assert.match(rebind, /"outcome=retrying"/);
  assert.match(rebind, /name: Dispatch one bounded fresh-base retry/);
  assert.match(rebind, /if \[\[ "\$GITHUB_RUN_ATTEMPT" == "1" \]\]; then/);
  assert.match(rebind, /trigger-chatgpt-rebind\.mjs retry-transient/);
  assert.match(rebind, /trigger-chatgpt-rebind\.mjs settle-failed/);
  assert.doesNotMatch(
    rebind,
    /"labels":\["chatgpt-binding","pending"\][\s\S]*?outcome=retrying/,
  );
  assert.match(rebind, /if: steps\.state\.outputs\.outcome == 'success'/);
  assert.match(rebind, /chatgpt-rebind-run-lineage-v1 \$GITHUB_RUN_ID \$automatic_parent/);
  assert.doesNotMatch(rebind, /git rebase/);
});

test("failed runs settle only after the bounded transient classifier", async () => {
  const rebind = await source("rebind-chatgpt.yml");
  const classifier = rebind.slice(
    rebind.indexOf("name: Classify and settle this failed run"),
    rebind.indexOf("name: Continue or stop an exact frozen backtest batch"),
  );
  assert.match(
    classifier,
    /\{jobs: \[ \.\[\] \| \.jobs\[\] \| select\(\.status == "completed"\) \]\}/,
  );
  assert.doesNotMatch(classifier, /\.\[\]\[\] \| \.jobs\[\]/);
  assert.match(classifier, /\{conclusion:"failure",run_attempt:\$attempt\}/);
  assert.match(classifier, /retry-transient-rebind-failure\.mjs/);
  assert.match(classifier, /trigger-chatgpt-rebind\.mjs retry-transient/);
  assert.match(classifier, /trigger-chatgpt-rebind\.mjs settle-failed/);
  assert.match(
    rebind,
    /this run is applying the bounded transient-failure classifier/,
  );
  assert.match(rebind, /if: steps\.state\.outputs\.outcome == 'success'/);
  assert.match(rebind, /if: always\(\) && steps\.state\.outputs\.outcome != 'success'/);
  const names = await readdir(workflows);
  assert.equal(names.includes("retry-transient-rebind.yml"), false);
  const trigger = await readFile(
    path.join(root, "scripts", "trigger-chatgpt-rebind.mjs"),
    "utf8",
  );
  assert.match(trigger, /async function settleFailedRun/);
  assert.match(trigger, /await continueBatch\(repository, match\.issue\.number, "failed"\)/);
  assert.match(trigger, /\["retry-transient", "settle-failed"\]/);
  assert.match(trigger, /shouldRetryTransientFailure/);
  assert.match(trigger, /chatgpt-rebind-pending-redrive-v1/);
  assert.match(trigger, /issues\/\$\{issue\.number\}\/timeline\?per_page=100/);
  assert.match(trigger, /select\(\.event == "reopened"\)/);
  assert.match(trigger, /decision === "retry-transient"/);
  const retry = trigger.slice(
    trigger.indexOf("async function retryTransientRun"),
    trigger.indexOf("export function backtestBatchId"),
  );
  assert.match(
    retry,
    /chatgpt-rebind-auto-retry-v1[\s\S]*chatgpt-rebind-rescue-v1[\s\S]*recordAutomaticRetryDispatch[\s\S]*setIssueStatus\(repository, match\.issue\.number, "failed"\)[\s\S]*await dispatch/,
  );
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
