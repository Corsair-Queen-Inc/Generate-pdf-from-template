#!/usr/bin/env node
/**
 * Auto-regenerate a PDF whenever the template file is saved.
 *
 * Usage:
 *   node watch.js [template.js] [data.txt] [output.pdf]
 *
 * Defaults:
 *   template  styleD.js
 *   data      data.txt
 *   output    resume.pdf
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const TEMPLATE = path.resolve(ROOT, process.argv[2] || "styleD.js");
const DATA = path.resolve(ROOT, process.argv[3] || "data.txt");
const OUTPUT = path.resolve(ROOT, process.argv[4] || "resume.pdf");

let debounce = null;
let busy = false;

function generate() {
  if (busy) return;
  busy = true;
  const ts = new Date().toLocaleTimeString();
  console.log(`[${ts}] Generating ${path.basename(OUTPUT)}...`);
  try {
    execSync(
      `node "${path.join(ROOT, "generate.js")}" "${TEMPLATE}" "${DATA}" "${OUTPUT}"`,
      { stdio: "inherit", cwd: ROOT }
    );
  } catch (_) {
    // error output already printed via stdio:inherit
  }
  busy = false;
}

// Run once on start
generate();

fs.watch(TEMPLATE, (event) => {
  if (event !== "change") return;
  clearTimeout(debounce);
  debounce = setTimeout(generate, 150);
});

const rel = path.relative(ROOT, TEMPLATE);
console.log(`\nWatching ${rel} - save to regenerate ${path.basename(OUTPUT)}. Ctrl+C to stop.\n`);
