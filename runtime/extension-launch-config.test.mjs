import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import configuration from "./extension-launch-config.cjs";

const { installedExtensions, loadLaunchConfiguration, setExtensionEnabled } =
  configuration;

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "chatgptx-v5-launch-"));
  const storageDirectory = path.join(root, "state");
  const bindingDirectory = path.join(root, "binding");
  const extensionDirectory = path.join(root, "example");
  await Promise.all([
    mkdir(storageDirectory),
    mkdir(bindingDirectory),
    mkdir(extensionDirectory),
  ]);
  const hostFile = path.join(bindingDirectory, "host.js");
  const artifacts = {
    "host.js": "void 0;\n",
    "host-source-patch.cjs": "exports.patchBindingHostSource=()=>{};\n",
    "renderer-entry.ts": "void 0;\n",
    "renderer-adapter.ts": "void 0;\n",
    "renderer-host.js": "void 0;\n",
  };
  await Promise.all(
    Object.entries(artifacts).map(([name, source]) =>
      writeFile(path.join(bindingDirectory, name), source),
    ),
  );
  const manifestFile = path.join(bindingDirectory, "manifest.json");
  const digest = (source) => crypto.createHash("sha256").update(source).digest("hex");
  const manifestSource = `${JSON.stringify({
    schemaVersion: 2,
    version: "26.825.51511",
    appBuild: "7377",
    appAsarSha256: "a".repeat(64),
    downloadUrl:
      "https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-26.825.51511.zip",
    downloadLength: 595263123,
    downloadEdSignature:
      "9ig6An9v69dIpSgoSRGs6PoTr4sP4Dug9HcyWm4vMEB7W4owrEQT5cN+csTux1MdN70stJXuq1U6KRxzqBw9CQ==",
    apiVersion: "0.2.0",
    adapterVersion: "1.0.0",
    artifacts: {
      host: { path: "host.js", sha256: digest(artifacts["host.js"]) },
      patch: {
        path: "host-source-patch.cjs",
        sha256: digest(artifacts["host-source-patch.cjs"]),
      },
      rendererEntry: {
        path: "renderer-entry.ts",
        sha256: digest(artifacts["renderer-entry.ts"]),
      },
      rendererAdapterSource: {
        path: "renderer-adapter.ts",
        sha256: digest(artifacts["renderer-adapter.ts"]),
      },
      rendererBundle: {
        path: "renderer-host.js",
        sha256: digest(artifacts["renderer-host.js"]),
      },
    },
  })}\n`;
  await writeFile(manifestFile, manifestSource);
  await writeFile(path.join(extensionDirectory, "renderer.cjs"), "exports.activate=()=>{};\n");
  await writeFile(path.join(extensionDirectory, "settings.cjs"), "exports.activate=()=>{};\n");
  await writeFile(
    path.join(extensionDirectory, "package.json"),
    `${JSON.stringify({
      id: "example",
      name: "Example",
      description: "Example extension.",
      version: "1.0.0",
      chatgptx: {
        api: "0.2.0",
        renderer: "renderer.cjs",
        settings: { renderer: "settings.cjs", sectionId: "settings" },
      },
    })}\n`,
  );
  const configurationFile = path.join(root, "launch.json");
  await writeFile(
    configurationFile,
    `${JSON.stringify({
      schemaVersion: 2,
      bindingManifestFile: manifestFile,
      bindingManifestSha256: digest(manifestSource),
      storageDirectory,
      extensions: [{ packageDirectory: extensionDirectory, enabled: false }],
    })}\n`,
  );
  return { root, configurationFile, extensionDirectory, manifestFile };
}

test("launch configuration loads normal v5 dist entries and keeps disabled settings", async () => {
  const value = await fixture();
  try {
    const launch = loadLaunchConfiguration(value.configurationFile);
    assert.equal(launch.appVersion, "26.825.51511");
    assert.equal(launch.appBuild, "7377");
    assert.equal(launch.binding.manifestFile, await realpath(value.manifestFile));
    assert.equal(launch.binding.hostFile, await realpath(path.join(path.dirname(value.manifestFile), "host.js")));
    assert.equal(launch.extensions[0].enabled, false);
    const extensionDirectory = await realpath(value.extensionDirectory);
    assert.equal(launch.extensions[0].renderer, path.join(extensionDirectory, "renderer.cjs"));
    assert.equal(launch.extensions[0].settings, path.join(extensionDirectory, "settings.cjs"));
    assert.equal(installedExtensions(launch)[0].settingsSectionId, "example.settings");
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("launch configuration rejects caller-controlled app identity and manifest mutation", async () => {
  const value = await fixture();
  try {
    const raw = JSON.parse(await readFile(value.configurationFile, "utf8"));
    raw.appVersion = "26.999.1";
    await writeFile(value.configurationFile, JSON.stringify(raw));
    assert.throws(
      () => loadLaunchConfiguration(value.configurationFile),
      /unexpected fields/,
    );

    delete raw.appVersion;
    await writeFile(value.configurationFile, JSON.stringify(raw));
    await writeFile(value.manifestFile, `${await readFile(value.manifestFile, "utf8")} `);
    assert.throws(
      () => loadLaunchConfiguration(value.configurationFile),
      /manifest digest does not match/,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("launch configuration persists next-start enablement", async () => {
  const value = await fixture();
  try {
    const launch = loadLaunchConfiguration(value.configurationFile);
    const next = setExtensionEnabled(launch, "example", true);
    assert.equal(next.extensions[0].enabled, true);
    assert.match(await readFile(value.configurationFile, "utf8"), /"enabled": true/);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

test("launch configuration rejects duplicate ids and entry symlink escapes", async () => {
  const value = await fixture();
  try {
    const raw = JSON.parse(await readFile(value.configurationFile, "utf8"));
    raw.extensions.push({ ...raw.extensions[0] });
    await writeFile(value.configurationFile, JSON.stringify(raw));
    assert.throws(
      () => loadLaunchConfiguration(value.configurationFile),
      /Duplicate extension id/,
    );

    raw.extensions.pop();
    const outside = path.join(value.root, "outside.cjs");
    await writeFile(outside, "exports.activate=()=>{};\n");
    await rm(path.join(value.extensionDirectory, "renderer.cjs"));
    await symlink(outside, path.join(value.extensionDirectory, "renderer.cjs"));
    await writeFile(value.configurationFile, JSON.stringify(raw));
    assert.throws(
      () => loadLaunchConfiguration(value.configurationFile),
      /symbolic link/,
    );
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
