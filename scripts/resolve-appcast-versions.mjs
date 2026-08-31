#!/usr/bin/env node

import crypto from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const defaultAppcastUrl =
  "https://persistent.oaistatic.com/codex-app-prod/appcast.xml";

const versionPattern = /^\d+(?:\.\d+)+$/;
const appBuildPattern = /^\d+$/;

function attribute(element, name, description) {
  return decodeXml(
    firstMatch(
      element,
      new RegExp(`\\b${name}=(['\"])(.*?)\\1`, "i"),
      description,
      2,
    ).trim(),
  );
}

function decodeEdSignature(value) {
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 64 || decoded.toString("base64") !== value) {
    throw new Error("Sparkle enclosure has an invalid Ed25519 signature");
  }
  return value;
}

function decodeXml(value) {
  return value.replace(
    /&(amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi,
    (entity, name) => {
      const normalized = name.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      }
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    },
  );
}

function firstMatch(value, expression, description, group = 1) {
  const match = expression.exec(value);
  if (!match) throw new Error(description);
  return match[group];
}

export function expectedDownloadUrl(version) {
  if (!versionPattern.test(version)) {
    throw new TypeError("ChatGPT version must be numeric dot-separated components");
  }
  return `https://persistent.oaistatic.com/codex-app-prod/ChatGPT-darwin-arm64-${version}.zip`;
}

export function parseAppcast(xml) {
  if (typeof xml !== "string" || xml.length === 0) {
    throw new TypeError("Sparkle appcast XML is required");
  }
  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)];
  if (items.length === 0) throw new Error("Sparkle appcast has no items");

  const seen = new Set();
  const builds = [];
  for (const itemMatch of items) {
    const item = itemMatch[1];
    const enclosures = [...item.matchAll(/<enclosure\b[^>]*>/gi)].map(
      (match) => match[0],
    );
    if (enclosures.length === 0) throw new Error("Sparkle item has no enclosure");
    const title = decodeXml(
      firstMatch(
        item,
        /<title\b[^>]*>([\s\S]*?)<\/title>/i,
        "Sparkle item has no title",
      ).trim(),
    );
    const enclosureVersionMatch = enclosures
      .map((enclosure) =>
        /\bsparkle:shortVersionString=(["'])(.*?)\1/i.exec(enclosure),
      )
      .find(Boolean);
    const itemShortVersion = /<sparkle:shortVersionString\b[^>]*>([\s\S]*?)<\/sparkle:shortVersionString>/i.exec(item)?.[1];
    const version = decodeXml(
      (itemShortVersion ?? enclosureVersionMatch?.[2] ?? title).trim(),
    );
    if (!versionPattern.test(version)) {
      throw new Error(`Invalid Sparkle version: ${version}`);
    }
    const expected = expectedDownloadUrl(version);
    if (title !== version && versionPattern.test(title)) {
      throw new Error(`Sparkle item title ${title} does not match ${version}`);
    }
    const appBuild = decodeXml(
      firstMatch(
        item,
        /<sparkle:version\b[^>]*>([\s\S]*?)<\/sparkle:version>/i,
        `Sparkle item ${version} has no app build`,
      ).trim(),
    );
    if (!appBuildPattern.test(appBuild)) {
      throw new Error(`Invalid Sparkle app build: ${appBuild}`);
    }
    const fullEnclosure = enclosures.find(
      (enclosure) =>
        attribute(
          enclosure,
          "url",
          `Sparkle item ${version} has an enclosure without a URL`,
        ) === expected,
    );
    if (!fullEnclosure) {
      throw new Error(
        `Sparkle item ${version} must contain the full arm64 URL ${expected}`,
      );
    }
    const downloadLengthText = attribute(
      fullEnclosure,
      "length",
      `Sparkle item ${version} full enclosure has no length`,
    );
    if (!/^\d+$/.test(downloadLengthText)) {
      throw new Error(`Sparkle item ${version} has an invalid enclosure length`);
    }
    const downloadLength = Number(downloadLengthText);
    if (!Number.isSafeInteger(downloadLength) || downloadLength <= 0) {
      throw new Error(`Sparkle item ${version} has an invalid enclosure length`);
    }
    const downloadEdSignature = decodeEdSignature(
      attribute(
        fullEnclosure,
        "sparkle:edSignature",
        `Sparkle item ${version} full enclosure has no Ed25519 signature`,
      ),
    );
    if (seen.has(version)) continue;
    seen.add(version);
    builds.push(
      Object.freeze({
        version,
        appBuild,
        downloadUrl: expected,
        downloadLength,
        downloadEdSignature,
      }),
    );
  }
  return Object.freeze(builds);
}

export function resolveOffsets(xml, offsets = [0, 2, 4]) {
  if (
    !Array.isArray(offsets) ||
    offsets.length === 0 ||
    offsets.some(
      (offset, index) =>
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offsets.indexOf(offset) !== index,
    )
  ) {
    throw new TypeError("Offsets must be unique non-negative integers");
  }
  const builds = parseAppcast(xml);
  const missing = offsets.filter((offset) => offset >= builds.length);
  if (missing.length > 0) {
    throw new Error(
      `Sparkle appcast has ${builds.length} unique builds; missing offsets ${missing.join(", ")}`,
    );
  }
  const snapshotSha256 = crypto.createHash("sha256").update(xml).digest("hex");
  return Object.freeze({
    schemaVersion: 2,
    source: "openai-chatgpt-macos-appcast",
    snapshotSha256,
    builds: Object.freeze(
      offsets.map((offset) =>
        Object.freeze({ offset, ...builds[offset] }),
      ),
    ),
  });
}

function parseOffsets(value) {
  const offsets = value.split(",").map((part) => {
    if (!/^\d+$/.test(part)) throw new Error(`Invalid offset: ${part}`);
    return Number(part);
  });
  return offsets;
}

export function parseArguments(argv) {
  const options = {
    feed: defaultAppcastUrl,
    offsets: [0, 2, 4],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--feed") {
      options.feed = argv[++index];
      if (!options.feed) throw new Error("--feed requires a URL or file path");
      continue;
    }
    if (argument === "--offsets") {
      const value = argv[++index];
      if (!value) throw new Error("--offsets requires a comma-separated list");
      options.offsets = parseOffsets(value);
      continue;
    }
    if (argument === "--output") {
      options.output = argv[++index];
      if (!options.output) throw new Error("--output requires a path");
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function readFeed(source) {
  if (/^https:\/\//.test(source)) {
    const response = await fetch(source, {
      headers: {
        Accept: "application/xml,text/xml,*/*",
        "User-Agent":
          "chatgpt-extensions-version-resolver/1.0 (+https://github.com/zats/chatgpt-extensions)",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Sparkle appcast request failed with HTTP ${response.status}`);
    }
    return response.text();
  }
  if (/^[a-z]+:\/\//i.test(source)) {
    throw new Error("Only HTTPS feed URLs are allowed");
  }
  return readFile(source, "utf8");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = resolveOffsets(await readFeed(options.feed), options.offsets);
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) {
    await writeFile(options.output, output, { encoding: "utf8", mode: 0o600 });
  } else {
    process.stdout.write(output);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
