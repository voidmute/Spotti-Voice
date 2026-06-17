/**
 * Replaces stock Electron default_app — loads setup main.mjs from setup-ui root.
 * Launched as: "Spotti Voice Setup.exe" "C:\...\setup-ui"
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function resolveSetupRoot() {
  for (const arg of process.argv.slice(1)) {
    if (!arg || arg.startsWith("-")) continue;
    const resolved = path.resolve(arg);
    if (fs.existsSync(path.join(resolved, "main.mjs"))) {
      return resolved;
    }
  }

  const runtimeDir = path.dirname(process.execPath);
  const parentDir = path.dirname(runtimeDir);
  if (fs.existsSync(path.join(parentDir, "main.mjs"))) {
    return parentDir;
  }

  return runtimeDir;
}

const installRoot = resolveSetupRoot();
const mainPath = path.join(installRoot, "main.mjs");

if (!fs.existsSync(mainPath)) {
  process.exit(11);
}

import(pathToFileURL(mainPath).href).catch(() => {
  process.exit(1);
});
