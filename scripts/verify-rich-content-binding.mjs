#!/usr/bin/env node

import { verifyInstalledRichContentBinding } from "../runtime/bindings/26.825.51511/rich-content-binding-verifier.mjs";

function parseArguments(argv) {
  let appPath;
  let asarBinary;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--app") {
      appPath = argv[index + 1];
      if (!appPath) throw new Error("--app requires a path");
      index += 1;
      continue;
    }
    if (argument === "--asar") {
      asarBinary = argv[index + 1];
      if (!asarBinary) throw new Error("--asar requires a path");
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return { appPath, asarBinary };
}

try {
  const result = await verifyInstalledRichContentBinding(
    parseArguments(process.argv.slice(2)),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `Rich-content binding verification failed: ${String(error?.message ?? error)}\n`,
  );
  process.exitCode = 1;
}
