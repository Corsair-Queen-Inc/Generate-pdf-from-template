const PDFDocument = require("pdfkit");
const path = require("path");
const { resolveFontName, resolveFontsDir } = require("../lib/pdfUtils");
const { normalizeParagraphText } = require("../lib/textUtils");

const REGULAR_FONT_FILE = "EBGaramond-Regular.ttf";
const BOLD_FONT_FILE = "EBGaramond-Bold.ttf";
const BODY_SIZE = 10.5;
const SECTION_SIZE = 11;
const DATES_W = 115;

function parseBoldSegments(text) {
  const parts = [];
  const regex = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), bold: false });
    parts.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.length ? parts : [{ text, bold: false }];
}

function formatDateRange(start, end) {
  return [start, end]
    .filter(Boolean)
    .map((d) => normalizeParagraphText(d))
    .join(" – ");
}

function employerLocation(exp) {
  return normalizeParagraphText(exp.employeer_location || exp.location || "");
}

function flattenSkills(skills) {
  const allSkills = [];
  skills.forEach((row) => {
    if (!row || !row.length) return;
    const skillsText = row
      .slice(2)
      .map((s) => normalizeParagraphText(s?.text ?? s))
      .join("")
      .trim();
    if (!skillsText) return;
    skillsText.split(",").forEach((s) => {
      const t = s.trim();
      if (t) allSkills.push(t);
    });
  });
  return allSkills;
}

module.exports.createResumePdfD = async function createResumePdfE(buffer, options = {}) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 55, right: 55 },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontsDir = resolveFontsDir(
      path.join(__dirname, "fonts"),
      path.join(__dirname, "..", "fonts")
    );
    const regularFont = resolveFontName(doc, fontsDir, REGULAR_FONT_FILE, "Helvetica", "stylee-regular");
    const boldFont = resolveFontName(doc, fontsDir, BOLD_FONT_FILE, "Helvetica-Bold", "stylee-bold");

    doc.fillColor("#000000");
    doc.y = doc.page.margins.top;
    doc.x = doc.page.margins.left;

    const contentX = () => doc.page.margins.left;
    const contentWidth = () => doc.page.width - doc.page.margins.right - doc.page.margins.left;

    const ensureSpace = (neededPt) => {
      if (doc.y + neededPt > doc.page.maxY()) doc.addPage();
    };

    const gapDown = (lines) => {
      if (lines > 0) doc.moveDown(lines);
    };

    const renderSmallCapsName = (name, capSize) => {
      const scSize = Math.round(capSize * 0.72);
      const words = name.toUpperCase().split(/\s+/);
      const x = contentX();
      const w = contentWidth();

      let totalWidth = 0;
      words.forEach((word, wi) => {
        if (wi > 0) {
          doc.font(boldFont).fontSize(capSize);
          totalWidth += doc.widthOfString(" ");
        }
        [...word].forEach((ch, ci) => {
          doc.font(boldFont).fontSize(ci === 0 ? capSize : scSize);
          totalWidth += doc.widthOfString(ch);
        });
      });

      let curX = x + (w - totalWidth) / 2;
      const baseY = doc.y;
      doc.font(boldFont).fontSize(capSize);
      const lineH = doc.currentLineHeight(true);
      const scOffset = (capSize - scSize) * 0.8;

      words.forEach((word, wi) => {
        if (wi > 0) {
          doc.font(boldFont).fontSize(capSize);
          curX += doc.widthOfString(" ");
        }
        [...word].forEach((ch, ci) => {
          const sz = ci === 0 ? capSize : scSize;
          doc.font(boldFont).fontSize(sz).text(ch, curX, baseY + (ci === 0 ? 0 : scOffset), {
            lineBreak: false,
          });
          doc.font(boldFont).fontSize(sz);
          curX += doc.widthOfString(ch);
        });
      });

      doc.y = baseY + lineH + 2;
      doc.x = x;
    };

    const renderInlineText = (text, x, y, opts = {}) => {
      const { fontSize = BODY_SIZE, ...textOpts } = opts;
      const segs = parseBoldSegments(text);
      const hasBold = segs.some((s) => s.bold);
      if (!hasBold) {
        doc.font(regularFont).fontSize(fontSize).text(text, x, y, textOpts);
        return;
      }
      segs.forEach((seg, i) => {
        const isLast = i === segs.length - 1;
        doc.font(seg.bold ? boldFont : regularFont).fontSize(fontSize);
        if (i === 0) {
          doc.text(seg.text, x, y, { ...textOpts, continued: !isLast });
        } else {
          doc.text(seg.text, { continued: !isLast });
        }
      });
      doc.x = contentX();
    };

    const renderBulletItem = (text, bulletOptions = {}) => {
      if (!text) return;

      const bulletOffset = bulletOptions.bulletOffset ?? 2;
      const textOffset = bulletOptions.textOffset ?? 12;
      const bulletChar = bulletOptions.bulletChar ?? "\u2022";
      const bulletRadius = bulletOptions.bulletRadius ?? null;

      const lineX = contentX() + bulletOffset;
      const textX = lineX + textOffset;
      const maxW = doc.page.width - doc.page.margins.right - textX;
      const plain = text.replace(/\*\*/g, "");

      ensureSpace(doc.font(regularFont).fontSize(BODY_SIZE).heightOfString(plain, { width: maxW }) + 2);
      const lineY = doc.y;

      if (bulletRadius !== null) {
        const cy = lineY + doc.currentLineHeight(true) / 2;
        doc.circle(lineX + bulletRadius, cy, bulletRadius).fill("#000000");
      } else {
        doc.font(regularFont).fontSize(BODY_SIZE).text(bulletChar, lineX, lineY, { lineBreak: false });
      }

      renderInlineText(text, textX, lineY, { width: maxW });
    };

    const sectionTitle = (title) => {
      ensureSpace(25);
      doc.x = contentX();
      gapDown(0.5);
      doc.font(boldFont).fontSize(SECTION_SIZE).text(title.toUpperCase(), contentX(), doc.y, {
        width: contentWidth(),
      });
      const ruleY = doc.y + 1;
      doc
        .moveTo(contentX(), ruleY)
        .lineTo(contentX() + contentWidth(), ruleY)
        .strokeColor("#000000")
        .lineWidth(0.75)
        .stroke();
      doc.y = ruleY + 10;
      doc.x = contentX();
    };

    const renderEntityRow = (boldPart, regularSuffix, date) => {
      const x = contentX();
      const w = contentWidth();
      const rowY = doc.y;
      let curX = x;

      if (boldPart) {
        doc.font(boldFont).fontSize(BODY_SIZE).text(boldPart, curX, rowY, { lineBreak: false });
        curX += doc.widthOfString(boldPart);
      }
      if (regularSuffix) {
        doc.font(regularFont).fontSize(BODY_SIZE).text(regularSuffix, curX, rowY, { lineBreak: false });
      }
      if (date) {
        doc.font(regularFont).fontSize(BODY_SIZE).text(date, x + w - DATES_W, rowY, {
          width: DATES_W,
          align: "right",
          lineBreak: false,
        });
      }

      doc.y = rowY + doc.currentLineHeight(true) + 1;
      doc.x = x;
    };

    const renderSkillsColumns = (allSkills) => {
      if (!allSkills.length) return;

      const numCols = 3;
      const colW = contentWidth() / numCols;
      const startX = contentX();
      const startY = doc.y;
      const bulletPad = 10;
      const textW = colW - bulletPad - 2;
      const itemGap = 3;

      doc.font(regularFont).fontSize(BODY_SIZE);
      const itemsPerCol = Math.ceil(allSkills.length / numCols);
      let maxY = startY;

      for (let col = 0; col < numCols; col++) {
        const colX = startX + col * colW;
        const si = col * itemsPerCol;
        const ei = Math.min(si + itemsPerCol, allSkills.length);
        let cy = startY;

        for (let i = si; i < ei; i++) {
          const skill = allSkills[i];
          const opts = { width: textW, align: "left", lineGap: 1 };
          const itemH = doc.heightOfString(skill, opts);

          if (cy + itemH > doc.page.maxY()) {
            doc.addPage();
            cy = doc.page.margins.top;
          }

          doc.text("•", colX, cy, { lineBreak: false });
          doc.x = colX + bulletPad;
          doc.y = cy;
          doc.text(skill, opts);

          cy += itemH + itemGap;
        }
        if (cy > maxY) maxY = cy;
      }

      doc.y = maxY;
      doc.x = contentX();
    };

    if (buffer.name) {
      renderSmallCapsName(normalizeParagraphText(buffer.name), 22);
    }

    const contactParts = [buffer.address, buffer.phone, buffer.email, buffer.linkedin]
      .map(normalizeParagraphText)
      .filter(Boolean);
    if (contactParts.length) {
      doc.font(regularFont).fontSize(10).text(contactParts.join(" • "), contentX(), doc.y + 2, {
        width: contentWidth(),
        align: "center",
      });
      gapDown(1.5);
    }

    if (buffer.summary) {
      sectionTitle("Professional Summary");
      renderInlineText(normalizeParagraphText(buffer.summary), contentX(), doc.y, { width: contentWidth() });
      gapDown(0.4);
    }

    if (Array.isArray(buffer.experience) && buffer.experience.length) {
      sectionTitle("Professional Experience");

      buffer.experience.forEach((exp) => {
        if (!exp) return;
        ensureSpace(35);

        const loc = employerLocation(exp);
        const company = normalizeParagraphText(exp.company);
        const title = normalizeParagraphText(exp.title);
        const dates = formatDateRange(exp.start_date, exp.end_date);

        renderEntityRow(company, loc ? `, ${loc}` : "", dates);

        if (title) {
          doc.font(boldFont).fontSize(BODY_SIZE).text(title, contentX(), doc.y, { width: contentWidth() });
        }

        if (Array.isArray(exp.achievements)) {
          exp.achievements.forEach((a) => {
            if (a) renderBulletItem(String(a), { bulletOffset: 12, textOffset: 12, bulletRadius: 2 });
          });
        }

        if (exp.environment) {
          const envText = normalizeParagraphText(String(exp.environment).replace(/\*\*/g, ""));
          ensureSpace(doc.font(regularFont).fontSize(BODY_SIZE).heightOfString(envText, { width: contentWidth() }) + 4);
          gapDown(0.1);
          renderInlineText(`**Environment:** ${envText}`, contentX(), doc.y, { width: contentWidth() });
          doc.x = contentX();
        }

        gapDown(0.5);
      });
    }

    if (buffer.education) {
      sectionTitle("Education");

      const edu = buffer.education;
      const school = normalizeParagraphText(edu.school);
      const loc = normalizeParagraphText(edu.location);
      const degree = normalizeParagraphText(edu.degree);
      const eduDates = formatDateRange(edu.start_date, edu.end_date);

      renderEntityRow(school, loc ? `, ${loc}` : "", eduDates);

      if (degree) {
        doc.font(regularFont).fontSize(BODY_SIZE).text(degree, contentX(), doc.y, { width: contentWidth() });
      }
      gapDown(0.5);
    }

    if (Array.isArray(buffer.skills) && buffer.skills.length) {
      sectionTitle("Skills");

      const allSkills = flattenSkills(buffer.skills);
      if (allSkills.length) {
        renderSkillsColumns(allSkills);
        gapDown(0.3);
      }
    }

    if (Array.isArray(buffer.certifications) && buffer.certifications.length) {
      sectionTitle("Certifications");
      buffer.certifications.forEach((cert) => {
        if (!cert || !cert.name) return;
        const certText = cert.site_url ? `${cert.name} ${cert.site_url}` : cert.name;
        renderBulletItem(certText, { bulletOffset: 12, textOffset: 12, bulletRadius: 2.5 });
      });
    }

    doc.end();
  });
};
