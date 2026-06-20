#!/usr/bin/env node
/**
 * Generate resume.pdf from data.txt + a PDF template (classic.js or styleA.js).
 *
 * Usage:
 *   node generate.js [template.js] [data.txt] [output.pdf]
 *
 * Defaults (from project root):
 *   template  ./classic.js
 *   data      ./data.txt
 *   output    ./resume.pdf
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { sanitizeResumeBuffer } = require("./lib/textUtils");

const ROOT = __dirname;

// Redirect ../lib/* requires from a template file to this project's lib/ directory.
// This lets templates that were written for a parent-directory layout (require("../lib/..."))
// work correctly when the template lives in the project root.
function shimLibForTemplate(absTemplatePath) {
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (parent && parent.filename === absTemplatePath) {
      const m = request.match(/^\.\.\/lib\/(.+)$/);
      if (m) {
        const candidate = path.join(ROOT, "lib", `${m[1]}.js`);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
    return original.call(this, request, parent, isMain, options);
  };
}

/** Fixed header/contact block merged into every PDF (data.txt supplies summary/skills/experience). */
const CONTACT_DATA = {
  name: "Kevin Horton",
  email: "kevin.horton@email.com",
  phone: "(312) 555-0147",
  address: "Chicago, IL",
  linkedin: "linkedin.com/in/kevin-horton",
  education: {
    school: "University of Illinois Urbana-Champaign",
    degree: "Bachelor of Science in Computer Science",
    start_date: "2010",
    end_date: "2014",
  },
};

function defaultTemplatePath() {
  const candidates = [
    path.join(ROOT, "classic.js"),
    path.join(ROOT, "resume", "pdf", "classic.js"),
    path.join(ROOT, "pdf", "classic.js"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || candidates[0];
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    template: path.resolve(args[0] || defaultTemplatePath()),
    data: path.resolve(args[1] || path.join(ROOT, "data.txt")),
    output: path.resolve(args[2] || path.join(ROOT, "resume.pdf")),
  };
}

function loadResumeData(dataPath) {
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data file not found: ${dataPath}`);
  }

  const raw = fs.readFileSync(dataPath, "utf8").trim();
  if (!raw) {
    throw new Error(`Data file is empty: ${dataPath}`);
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${dataPath}: ${err.message}`);
  }
}

function loadTemplate(templatePath) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const absTemplate = path.resolve(templatePath);
  shimLibForTemplate(absTemplate);
  delete require.cache[absTemplate];
  const mod = require(absTemplate);

  const createPdf = mod.createResumePdf || mod.createResumePdfA || mod.createResumePdfD;
  if (typeof createPdf !== "function") {
    throw new Error(
      `Template must export createResumePdf, createResumePdfA, or createResumePdfD: ${templatePath}`
    );
  }

  return createPdf;
}

async function main() {
  const { template, data, output } = parseArgs();

  console.log(`Template: ${template}`);
  console.log(`Data:     ${data}`);
  console.log(`Output:   ${output}`);

  const createPdf = loadTemplate(template);
  const resumeData = sanitizeResumeBuffer({
    ...CONTACT_DATA,
    ...loadResumeData(data),
  });
  const pdfBuffer = await createPdf(resumeData, {});

  fs.writeFileSync(output, pdfBuffer);
  console.log(`Wrote ${output} (${pdfBuffer.length} bytes)`);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
