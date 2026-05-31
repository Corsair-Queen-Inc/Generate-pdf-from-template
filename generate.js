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

const ROOT = __dirname;

/** Fixed header/contact block — merged into every PDF (data.txt supplies summary/skills/experience). */
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

function normalizeParagraphText(value) {
  return String(value ?? "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function achievementToString(value) {
  if (value == null) return "";
  if (typeof value === "string") return normalizeParagraphText(value);
  if (typeof value === "object" && value.text != null) {
    return normalizeParagraphText(value.text);
  }
  return normalizeParagraphText(String(value));
}

function sanitizeResumeBuffer(buffer) {
  if (!buffer || typeof buffer !== "object") return buffer;

  if (buffer.summary) {
    buffer.summary = normalizeParagraphText(buffer.summary);
  }

  if (Array.isArray(buffer.skills)) {
    buffer.skills = buffer.skills
      .filter((row) => Array.isArray(row) && row.length > 0)
      .map((row) =>
        row.map((segment) => {
          if (!segment || typeof segment !== "object") return segment;
          if (segment.text == null) return segment;
          return { ...segment, text: normalizeParagraphText(segment.text) };
        })
      );
  }

  if (Array.isArray(buffer.experience)) {
    buffer.experience = buffer.experience.map((exp) => {
      if (!exp || typeof exp !== "object") return exp;
      const next = { ...exp };
      if (Array.isArray(next.achievements)) {
        next.achievements = next.achievements.map(achievementToString).filter(Boolean);
      }
      return next;
    });
  }

  return buffer;
}

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

  delete require.cache[templatePath];
  const mod = require(templatePath);

  const createPdf = mod.createResumePdf || mod.createResumePdfA;
  if (typeof createPdf !== "function") {
    throw new Error(
      `Template must export createResumePdf or createResumePdfA: ${templatePath}`
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
  console.log(`✅ Wrote ${output} (${pdfBuffer.length} bytes)`);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
