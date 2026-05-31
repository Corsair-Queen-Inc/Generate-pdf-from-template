const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const MIN_LINE_PT = 11;

const BUILT_IN_FONTS = new Set([
  "Courier",
  "Courier-Bold",
  "Helvetica",
  "Helvetica-Bold",
  "Times-Roman",
  "Times-Bold",
]);

const CLASSIC_LAYOUT = {
  source: "Data.docx",
  page: {
    size: "LETTER",
    marginTopPt: 63,
    marginRightPt: 36,
    marginBottomPt: 36,
    marginLeftPt: 40.5,
  },
  fonts: {
    regular: "Calibri",
    bold: "Calibri-Bold",
    italic: "Calibri-Italic",
    windowsRegular: "C:\\Windows\\Fonts\\calibri.ttf",
    windowsBold: "C:\\Windows\\Fonts\\calibrib.ttf",
    windowsItalic: "C:\\Windows\\Fonts\\calibrii.ttf",
    fallbackRegular: "Helvetica",
    fallbackBold: "Helvetica-Bold",
  },
  colors: {
    accent: "#00786C",
    contact: "#404040",
    body: "#52575C",
  },
  name: {
    sizePt: 36,
    bold: true,
    color: "#00786C",
    align: "left",
    spaceAfterPt: 2,
  },
  contact: {
    sizePt: 10.5,
    color: "#404040",
    separator: " • ",
    align: "left",
    spaceAfterPt: 6,
  },
  summary: {
    sizePt: 10,
    color: "#52575C",
    align: "left",
    lineGapRatio: 0.5,
    spaceBeforePt: 4,
    spaceAfterPt: 12,
    showSectionTitle: false,
  },
  sectionTitle: {
    sizePt: 12,
    bold: true,
    color: "#00786C",
    uppercase: true,
    drawRule: false,
    spaceBeforePt: 10,
    spaceAfterPt: 4,
  },
  skills: {
    groupSizePt: 11,
    groupBold: true,
    valueSizePt: 10,
    valueBold: false,
    valueIndentPt: 22.5,
    color: "#52575C",
    spaceAfterGroupLabelPt: 1,
    spaceAfterRowPt: 3,
    spaceAfterSectionPt: 10,
    sectionLabel: "SKILLS",
  },
  experience: {
    companySizePt: 11,
    companyBold: true,
    locationSizePt: 11,
    locationBold: false,
    locationSeparator: " – ",
    titleSizePt: 11,
    titleBold: true,
    datesSizePt: 10,
    datesItalic: true,
    color: "#52575C",
    headerSpaceAfterPt: 4,
    jobSpaceAfterPt: 8,
    datesColumnWidthPt: 115,
    bullet: {
      sizePt: 10,
      bulletOffsetPt: 9,
      textOffsetPt: 13.5,
      lineGapRatio: 0.5,
    },
  },
  education: {
    schoolSizePt: 11,
    schoolBold: true,
    detailSizePt: 10,
    color: "#52575C",
    spaceAfterPt: 10,
  },
  certifications: {
    sizePt: 10,
    color: "#52575C",
    bullet: {
      bulletOffsetPt: 9,
      textOffsetPt: 13.5,
    },
  },
};

function pageMaxY(doc) {
  return doc.page.maxY();
}

function normalizeCursor(doc) {
  if (doc.y + MIN_LINE_PT > pageMaxY(doc)) {
    doc.addPage();
  }
}

function flowGap(doc, pt) {
  if (!pt || pt <= 0) return;
  normalizeCursor(doc);
  const bottom = pageMaxY(doc);
  if (doc.y + pt + MIN_LINE_PT <= bottom) {
    doc.y += pt;
  } else {
    doc.addPage();
  }
}

function ensureSpace(doc, height) {
  normalizeCursor(doc);
  const needed = Math.max(height || 0, MIN_LINE_PT);
  if (doc.y + needed > pageMaxY(doc)) {
    doc.addPage();
  }
}

function normalizeParagraphText(value) {
  return String(value ?? "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeColor(color, fallback = "#1f2937") {
  if (typeof color !== "string") return fallback;
  const trimmed = color.trim();
  return /^#([0-9A-Fa-f]{6})$/.test(trimmed) ? trimmed : fallback;
}

function pdfLineGap(sizePt, ratio = 0.5) {
  return Math.max(0, Number(sizePt) * ratio);
}

function buildClassicSpec(options = {}) {
  const accent = sanitizeColor(options.fontColor, CLASSIC_LAYOUT.colors.accent);
  return {
    ...CLASSIC_LAYOUT,
    colors: {
      ...CLASSIC_LAYOUT.colors,
      accent,
    },
    name: { ...CLASSIC_LAYOUT.name, color: accent },
    sectionTitle: { ...CLASSIC_LAYOUT.sectionTitle, color: accent },
  };
}

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

function resolveClassicFonts(doc, fontsDir, fontSpec, aliasPrefix = "classic") {
  const tryPaths = (names) => {
    const paths = [];
    for (const name of names) {
      paths.push(path.join(fontsDir, name));
      if (/\.(ttf|otf)$/i.test(name)) continue;
      paths.push(path.join(fontsDir, `${name}.ttf`));
      paths.push(path.join(fontsDir, `${name}.otf`));
    }
    return paths;
  };

  const registerFirst = (candidates, fallback, label) => {
    for (const filePath of candidates) {
      if (filePath && fs.existsSync(filePath)) {
        const alias = `${aliasPrefix}-${label}`;
        doc.registerFont(alias, filePath);
        return alias;
      }
    }
    return resolveFontName(doc, fontsDir, null, fallback, `${aliasPrefix}-${label}`);
  };

  const regular = registerFirst(
    [
      ...tryPaths([fontSpec.regular, "calibri.ttf", "Calibri.ttf"]),
      fontSpec.windowsRegular,
    ].filter(Boolean),
    fontSpec.fallbackRegular,
    "regular"
  );

  const bold = registerFirst(
    [
      ...tryPaths([fontSpec.bold, "calibrib.ttf", "Calibri-Bold.ttf"]),
      fontSpec.windowsBold,
    ].filter(Boolean),
    fontSpec.fallbackBold,
    "bold"
  );

  const italic = registerFirst(
    [
      ...tryPaths([fontSpec.italic, "calibrii.ttf", "Calibri-Italic.ttf"]),
      fontSpec.windowsItalic,
    ].filter(Boolean),
    regular,
    "italic"
  );

  return { regular, bold, italic };
}

module.exports.createResumePdf = async function createResumePdf(buffer, options = {}) {
  const spec = buildClassicSpec(options);

  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: spec.page.size,
      margins: {
        top: spec.page.marginTopPt,
        bottom: spec.page.marginBottomPt,
        left: spec.page.marginLeftPt,
        right: spec.page.marginRightPt,
      },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontsDir = path.join(__dirname, "..", "fonts");
    const { regular: regularFont, bold: boldFont, italic: italicFont } = resolveClassicFonts(
      doc,
      fontsDir,
      spec.fonts,
      "classic"
    );

    const accentColor = sanitizeColor(options.fontColor, spec.colors.accent);
    const bodyColor = spec.colors.body;
    const contactColor = spec.colors.contact;

    const contentX = () => doc.page.margins.left;
    const contentWidth = () =>
      doc.page.width - doc.page.margins.right - doc.page.margins.left;

    const renderBulletItem = (text, bulletSpec) => {
      const normalized = normalizeParagraphText(text);
      if (!normalized) return;

      const bulletOffset = bulletSpec.bulletOffsetPt ?? 9;
      const textOffset = bulletSpec.textOffsetPt ?? 13.5;
      const sizePt = bulletSpec.sizePt ?? 10;
      const lineGap = pdfLineGap(sizePt, bulletSpec.lineGapRatio ?? 0.5);

      const lineX = doc.page.margins.left + bulletOffset;
      const textX = lineX + textOffset;
      const maxTextWidth = doc.page.width - doc.page.margins.right - textX;

      doc.fillColor(bodyColor).font(regularFont).fontSize(sizePt);
      const measureOpts = { width: maxTextWidth, align: "left", lineGap };
      const textHeight = doc.heightOfString(normalized, measureOpts);

      ensureSpace(doc, textHeight + 2);
      const lineY = doc.y;

      doc.text("•", lineX, lineY, { lineBreak: false });
      doc.text(normalized, textX, lineY, measureOpts);

      normalizeCursor(doc);
      doc.x = contentX();
    };

    const renderExperienceHeader = (exp) => {
      const x = contentX();
      const w = contentWidth();
      const expSpec = spec.experience;
      const company = String(exp.company || "").trim();
      const location = String(exp.location || exp.employeer_location || "").trim();
      const title = String(exp.title || "").trim();
      const dates = [exp.start_date, exp.end_date].filter(Boolean).join(" - ");
      const datesW = expSpec.datesColumnWidthPt;
      const companyW = w - datesW;

      normalizeCursor(doc);

      if (company || location || dates) {
        const y = doc.y;
        doc.fillColor(bodyColor).font(boldFont).fontSize(expSpec.companySizePt);
        const lineHeight = doc.currentLineHeight(true);

        if (company && location) {
          doc.text(company, x, y, { width: companyW, align: "left", lineBreak: false });
          const companyWidth = doc.widthOfString(company, {
            font: boldFont,
            size: expSpec.companySizePt,
          });
          doc
            .font(regularFont)
            .fontSize(expSpec.locationSizePt)
            .text(`${expSpec.locationSeparator}${location}`, x + companyWidth, y, {
              width: companyW - companyWidth,
              align: "left",
              lineBreak: false,
            });
        } else if (company) {
          doc.text(company, x, y, { width: companyW, align: "left", lineBreak: false });
        } else if (location) {
          doc
            .font(regularFont)
            .fontSize(expSpec.locationSizePt)
            .text(location, x, y, { width: companyW, align: "left", lineBreak: false });
        }

        if (dates) {
          doc
            .font(expSpec.datesItalic ? italicFont : regularFont)
            .fontSize(expSpec.datesSizePt)
            .text(dates, x + companyW, y, {
              width: datesW,
              align: "right",
              lineBreak: false,
            });
        }

        doc.y = y + lineHeight;
        doc.x = x;
      }

      if (title) {
        normalizeCursor(doc);
        doc
          .fillColor(bodyColor)
          .font(boldFont)
          .fontSize(expSpec.titleSizePt)
          .text(title, x, doc.y, { width: w, align: "left" });
        doc.x = x;
      }

      flowGap(doc, expSpec.headerSpaceAfterPt);
    };

    const sectionTitle = (title, titleOpts = {}) => {
      const st = { ...spec.sectionTitle, ...titleOpts };
      flowGap(doc, st.spaceBeforePt ?? spec.sectionTitle.spaceBeforePt);
      normalizeCursor(doc);
      const label = st.uppercase ? title.toUpperCase() : title;
      doc
        .fillColor(accentColor)
        .font(st.bold ? boldFont : regularFont)
        .fontSize(st.sizePt)
        .text(label, contentX(), doc.y, { width: contentWidth(), align: "left" });
      doc.fillColor(bodyColor);
      flowGap(doc, st.spaceAfterPt ?? spec.sectionTitle.spaceAfterPt);
    };

    const parseSkillRow = (row) => {
      if (!row || !row.length) return { category: "", values: "" };
      const parts = row.map((s) => String(s?.text ?? "").trim()).filter((t) => t.length > 0);
      if (!parts.length) return { category: "", values: "" };

      if (parts.length >= 3) {
        const category = `${parts[0]}${parts[1]}`.replace(/\s*:\s*$/, "");
        const values = parts.slice(2).join("").replace(/^:\s*/, "");
        return { category, values };
      }

      if (parts.length === 2) {
        const combined = `${parts[0]}${parts[1]}`;
        const colonAt = combined.indexOf(":");
        if (colonAt >= 0) {
          return {
            category: combined.slice(0, colonAt).trim(),
            values: combined.slice(colonAt + 1).trim(),
          };
        }
        return { category: parts[0], values: parts[1] };
      }

      const full = parts[0];
      const colonAt = full.indexOf(":");
      if (colonAt >= 0) {
        return {
          category: full.slice(0, colonAt).trim(),
          values: full.slice(colonAt + 1).trim(),
        };
      }
      return { category: full, values: "" };
    };

    const renderSkillGroup = (row) => {
      const sk = spec.skills;
      const { category, values } = parseSkillRow(row);
      if (!category && !values) return;

      const x = contentX();
      const groupLabel = category.includes(":") ? category : `${category}:`;

      normalizeCursor(doc);
      doc
        .fillColor(sk.color)
        .font(sk.groupBold ? boldFont : regularFont)
        .fontSize(sk.groupSizePt)
        .text(groupLabel, x, doc.y, { width: contentWidth(), align: "left" });

      if (values) {
        flowGap(doc, sk.spaceAfterGroupLabelPt);
        normalizeCursor(doc);
        const valueX = x + sk.valueIndentPt;
        const valueWidth = contentWidth() - sk.valueIndentPt;
        const lineGap = pdfLineGap(sk.valueSizePt, 0.5);
        const measureOpts = { width: valueWidth, align: "left", lineGap };
        ensureSpace(doc, doc.heightOfString(values, measureOpts) + 2);

        doc
          .font(sk.valueBold ? boldFont : regularFont)
          .fontSize(sk.valueSizePt)
          .text(values, valueX, doc.y, measureOpts);
      }

      normalizeCursor(doc);
      doc.x = x;
      flowGap(doc, sk.spaceAfterRowPt);
    };

    // Name
    if (buffer.name) {
      const n = spec.name;
      normalizeCursor(doc);
      doc
        .fillColor(accentColor)
        .font(n.bold ? boldFont : regularFont)
        .fontSize(n.sizePt)
        .text(buffer.name, contentX(), doc.y, {
          width: contentWidth(),
          align: n.align,
        });
      doc.fillColor(bodyColor);
      flowGap(doc, n.spaceAfterPt);
    }

    // Contact
    const contactParts = [];
    if (buffer.address) contactParts.push(buffer.address);
    if (buffer.phone) contactParts.push(buffer.phone);
    if (buffer.email) contactParts.push(buffer.email);
    if (buffer.linkedin) contactParts.push(buffer.linkedin);

    if (contactParts.length) {
      const c = spec.contact;
      normalizeCursor(doc);
      doc
        .fillColor(contactColor)
        .font(regularFont)
        .fontSize(c.sizePt)
        .text(contactParts.join(c.separator), contentX(), doc.y, {
          width: contentWidth(),
          align: c.align,
        });
      doc.fillColor(bodyColor);
      flowGap(doc, c.spaceAfterPt);
    }

    // Summary (no section header in Data.docx)
    if (buffer.summary) {
      const s = spec.summary;
      flowGap(doc, s.spaceBeforePt ?? 0);
      normalizeCursor(doc);
      const lineGap = pdfLineGap(s.sizePt, s.lineGapRatio);
      const measureOpts = { width: contentWidth(), align: s.align, lineGap };
      ensureSpace(doc, doc.heightOfString(buffer.summary, measureOpts) + 2);

      doc
        .font(regularFont)
        .fontSize(s.sizePt)
        .fillColor(bodyColor)
        .text(buffer.summary, contentX(), doc.y, measureOpts);
      flowGap(doc, s.spaceAfterPt);
    }

    // Skills
    if (Array.isArray(buffer.skills) && buffer.skills.length) {
      const sk = spec.skills;
      sectionTitle(sk.sectionLabel || "Skills", { uppercase: false });
      buffer.skills.forEach((row) => renderSkillGroup(row));
      flowGap(doc, sk.spaceAfterSectionPt);
    }

    // Experience
    if (Array.isArray(buffer.experience) && buffer.experience.length) {
      sectionTitle("Experience");
      const expSpec = spec.experience;
      buffer.experience.forEach((exp) => {
        if (!exp) return;
        renderExperienceHeader(exp);

        if (Array.isArray(exp.achievements)) {
          exp.achievements.forEach((a) => {
            if (!a) return;
            renderBulletItem(a, expSpec.bullet);
          });
        }
        flowGap(doc, expSpec.jobSpaceAfterPt);
      });
    }

    // Education
    if (buffer.education) {
      sectionTitle("Education");
      const ed = spec.education;
      normalizeCursor(doc);
      if (buffer.education.school) {
        doc
          .fillColor(ed.color)
          .font(boldFont)
          .fontSize(ed.schoolSizePt)
          .text(buffer.education.school, contentX(), doc.y, {
            width: contentWidth(),
            align: "left",
          });
      }
      const eduDetails = [];
      if (buffer.education.degree) eduDetails.push(buffer.education.degree);
      if (buffer.education.start_date || buffer.education.end_date) {
        const dates = [buffer.education.start_date, buffer.education.end_date]
          .filter(Boolean)
          .join(" - ");
        if (dates) eduDetails.push(`(${dates})`);
      }
      if (eduDetails.length) {
        normalizeCursor(doc);
        doc
          .font(regularFont)
          .fontSize(ed.detailSizePt)
          .text(eduDetails.join(" "), contentX(), doc.y, {
            width: contentWidth(),
            align: "left",
          });
      }
      flowGap(doc, ed.spaceAfterPt);
    }

    // Certifications
    if (Array.isArray(buffer.certifications) && buffer.certifications.length) {
      sectionTitle("Certifications");
      const certSpec = spec.certifications;
      buffer.certifications.forEach((cert) => {
        if (!cert || !cert.name) return;
        const certText = cert.site_url ? `${cert.name} — ${cert.site_url}` : cert.name;
        renderBulletItem(certText, { ...certSpec.bullet, sizePt: certSpec.sizePt });
      });
    }

    normalizeCursor(doc);
    doc.end();
  });
};
