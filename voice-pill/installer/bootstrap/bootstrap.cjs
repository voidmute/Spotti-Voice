/**
 * Replaces stock Electron default_app — loads setup main.mjs from the exe directory.
 */
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const installRoot = path.dirname(process.execPath);
const mainPath = path.join(installRoot, "main.mjs");

import(pathToFileURL(mainPath).href).catch((err) => {
  console.error("Spotti Voice setup failed to start:", err);
  process.exit(1);
});
