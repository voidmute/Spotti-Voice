/**
 * Copy electron.exe → branded Spotti Voice.exe (icon + Windows version strings).
 * Target MUST live in node_modules/electron/dist/ beside icudtl.dat and other Chromium runtime files.
 * Usage: node scripts/brand-electron-shell.mjs <source-electron.exe> <target-path>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(path.join(root, "electron", "package.json"));
const rcedit = require("rcedit");

const source = process.argv[2];
const target = process.argv[3];
const fileDescription = process.argv[4] || "Spotti Voice";
const originalFilename = process.argv[5] || "Spotti Voice.exe";
const requireAdmin = process.argv[6] === "admin" || process.argv[6] === "--admin";

if (!source || !target) {
  console.error(
    "Usage: node scripts/brand-electron-shell.mjs <source-electron.exe> <target-path> [fileDescription] [originalFilename] [admin]",
  );
  process.exit(1);
}

if (!fs.existsSync(source)) {
  console.error(`Source missing: ${source}`);
  process.exit(1);
}

const ico = path.join(root, "assets", "app-icon.ico");
if (!fs.existsSync(ico)) {
  console.error("Missing assets/app-icon.ico — run: python scripts/make-icon.py");
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });

const targetAbs = path.resolve(target);
const sourceAbs = path.resolve(source);
const workTarget =
  sourceAbs === targetAbs
    ? path.join(path.dirname(targetAbs), `.${path.basename(targetAbs)}.brand-tmp`)
    : targetAbs;

if (sourceAbs !== targetAbs || !fs.existsSync(workTarget)) {
  fs.copyFileSync(source, workTarget);
}

const rceditOptions = {
  icon: ico,
  "file-version": "0.1.0.0",
  "product-version": "0.1.0.0",
  "version-string": {
    CompanyName: "Spotti",
    FileDescription: fileDescription,
    InternalName: fileDescription,
    LegalCopyright: "Spotti",
    OriginalFilename: originalFilename,
    ProductName: fileDescription,
  },
};
if (requireAdmin) {
  rceditOptions["requested-execution-level"] = "requireAdministrator";
} else {
  rceditOptions["requested-execution-level"] = "asInvoker";
}

await rcedit(workTarget, rceditOptions);

if (workTarget !== targetAbs) {
  try {
    fs.rmSync(targetAbs, { force: true });
  } catch {
    /* target may be locked; caller can retry */
  }
  fs.renameSync(workTarget, targetAbs);
}

console.log(`Branded UI shell: ${targetAbs}`);
