#!/usr/bin/env node

import { open } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { runOwnedCommand } from "./owned-process.mjs";

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) {
    throw new Error(
      "usage: run-owned-command.mjs --timeout-ms <milliseconds> --stdin <file> --output <file> -- <executable> [arguments...]",
    );
  }
  const options = {};
  for (let index = 0; index < separator; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!["--timeout-ms", "--stdin", "--output"].includes(name) || !value) {
      throw new Error("Owned command options are invalid");
    }
    options[name.slice(2)] = value;
  }
  if (!/^\d+$/.test(options["timeout-ms"] ?? "")) {
    throw new Error("--timeout-ms must be a positive integer");
  }
  if (!options.stdin || !options.output) {
    throw new Error("--stdin and --output are required");
  }
  return {
    executable: argv[separator + 1],
    arguments: argv.slice(separator + 2),
    input: options.stdin,
    output: options.output,
    timeoutMilliseconds: Number(options["timeout-ms"]),
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const input = await open(options.input, "r");
  const output = await open(options.output, options.output === "/dev/null" ? "w" : "wx", 0o600);
  try {
    await runOwnedCommand(options.executable, options.arguments, {
      timeoutMilliseconds: options.timeoutMilliseconds,
      stdio: [input.fd, output.fd, output.fd],
    });
  } finally {
    await Promise.all([input.close(), output.close()]);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
