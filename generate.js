#!/usr/bin/env node
/**
 * Generate resume.pdf from data.txt + a PDF template (classic.js or styleA.js).
 *
 * Usage:
 *   node generate.js [template.js] [data.txt] [output.pdf]
 *
 * Defaults (from project root):
 *   template  ./resume/pdf/classic.js
 *   data      ./data.txt
 *   output    ./resume.pdf
 *
 * Portable folder — copy these files, then run `npm install` and `node generate.js`:
 *
 *   generate.js
 *   pdf/classic.js          (or pdf/styleA.js)
 *   data.txt
 *   fonts/                  (optional — Helvetica is used when fonts are missing)
 *   package.json            { "dependencies": { "pdfkit": "^0.17.2" } }
 *
 * lib/ is optional — generate.js bundles pdfUtils and textUtils when lib/ is absent.
 * Template must live in a pdf/ subfolder (classic.js expects ../lib and ../fonts).
 */

const fs = require("fs");
const path = require("path");
const Module = require("module");

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

// ---------------------------------------------------------------------------
// Bundled lib (used when lib/ is not present next to the template)
// ---------------------------------------------------------------------------

const bundledPdfUtils = (() => {
  const BUILT_IN_FONTS = new Set([
    "Courier",
    "Courier-Bold",
    "Helvetica",
    "Helvetica-Bold",
    "Times-Roman",
    "Times-Bold",
  ]);

  function resolveFontName(doc, fontsDir, desiredFont, fallbackFont, aliasPrefix) {
    if (!desiredFont) return fallbackFont;
    if (BUILT_IN_FONTS.has(desiredFont)) return desiredFont;

    const candidateNames = [desiredFont];
    if (!/\.(ttf|otf)$/i.test(desiredFont)) {
      candidateNames.push(`${desiredFont}.ttf`);
      candidateNames.push(`${desiredFont}.otf`);
    }

    for (const fileName of candidateNames) {
      const filePath = path.join(fontsDir, fileName);
      if (fs.existsSync(filePath)) {
        const alias = `${aliasPrefix}-${fileName.replace(/[^a-z0-9]/gi, "_")}`;
        doc.registerFont(alias, filePath);
        return alias;
      }
    }

    return fallbackFont;
  }

  function sanitizeColor(color, fallback = "#1f2937") {
    if (typeof color !== "string") return fallback;
    const trimmed = color.trim();
    return /^#([0-9A-Fa-f]{6})$/.test(trimmed) ? trimmed : fallback;
  }

  return { BUILT_IN_FONTS, resolveFontName, sanitizeColor };
})();

const bundledTextUtils = (() => {
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
          next.achievements = next.achievements
            .map(achievementToString)
            .filter(Boolean);
        }
        return next;
      });
    }

    return buffer;
  }

  return { normalizeParagraphText, achievementToString, sanitizeResumeBuffer };
})();

function loadBundledLib() {
  try {
    return {
      pdfUtils: require(path.join(ROOT, "resume", "lib", "pdfUtils.js")),
      textUtils: require(path.join(ROOT, "resume", "lib", "textUtils.js")),
    };
  } catch {
    return { pdfUtils: bundledPdfUtils, textUtils: bundledTextUtils };
  }
}

const { pdfUtils: libPdfUtils, textUtils: libTextUtils } = loadBundledLib();

let activeResumeRoot = null;

function installLibStubs(resumeRoot) {
  const libDir = path.join(resumeRoot, "lib");
  const stubs = [
    [path.join(libDir, "pdfUtils.js"), libPdfUtils],
    [path.join(libDir, "textUtils.js"), libTextUtils],
  ];

  for (const [filePath, exports] of stubs) {
    if (fs.existsSync(filePath)) continue;
    require.cache[filePath] = {
      id: filePath,
      filename: filePath,
      loaded: true,
      exports,
    };
  }
}

function installLibResolveHook() {
  if (Module._resolveFilename.__resumeGenerateHook) return;

  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resumeGenerateResolveFilename(
    request,
    parent,
    isMain,
    options
  ) {
    const libRequests = ["../lib/pdfUtils", "../lib/pdfUtils.js", "../lib/textUtils", "../lib/textUtils.js"];
    if (activeResumeRoot && parent && parent.filename && libRequests.includes(request)) {
      const base = request.replace(/\.js$/, "").split("/").pop();
      const stubPath = path.join(activeResumeRoot, "lib", `${base}.js`);
      if (!fs.existsSync(stubPath)) {
        installLibStubs(activeResumeRoot);
      }
      return stubPath;
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  Module._resolveFilename.__resumeGenerateHook = true;
}

function defaultTemplatePath() {
  const candidates = [
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

function resumeRootForTemplate(templatePath) {
  const dir = path.dirname(templatePath);
  if (path.basename(dir) === "pdf") return path.dirname(dir);
  return dir;
}

function loadTemplate(templatePath) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const resumeRoot = resumeRootForTemplate(templatePath);
  activeResumeRoot = resumeRoot;
  installLibResolveHook();
  installLibStubs(resumeRoot);

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
  const resumeData = libTextUtils.sanitizeResumeBuffer({
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
