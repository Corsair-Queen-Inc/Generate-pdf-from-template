const PDFDocument = require("pdfkit");
const path = require("path");
const { resolveFontName, resolveFontsDir, sanitizeColor } = require("./lib/pdfUtils");
const { normalizeParagraphText } = require("./lib/textUtils");

const DEFAULT_ACCENT_COLOR = "#1A1A1A";
const REGULAR_FONT_FILE = "EBGaramond-Regular.woff";
const BOLD_FONT_FILE = "EBGaramond-Bold.woff";

module.exports.createResumePdfD = async function createResumePdfD(buffer, options = {}) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 60, bottom: 40, left: 40, right: 40 },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontsDir = resolveFontsDir(
      path.join(__dirname, "fonts"),
      path.join(__dirname, "..", "fonts")
    );
    const regularFont = resolveFontName(doc, fontsDir, REGULAR_FONT_FILE, "Helvetica", "style-d-regular");
    const boldFont = resolveFontName(doc, fontsDir, BOLD_FONT_FILE, "Helvetica-Bold", "style-d-bold");
    const accentColor = sanitizeColor(options.fontColor, DEFAULT_ACCENT_COLOR);

    const contentX = () => doc.page.margins.left;
    const contentWidth = () => doc.page.width - doc.page.margins.right - doc.page.margins.left;

    const ensureSpace = (neededPt) => {
      if (doc.y + neededPt > doc.page.maxY()) doc.addPage();
    };

    const gapDown = (lines) => {
      if (lines > 0) doc.moveDown(lines);
    };

    const renderBulletItem = (text, bulletOptions = {}) => {
      const normalized = normalizeParagraphText(text);
      if (!normalized) return;

      const bulletOffset = bulletOptions.bulletOffset ?? 0;
      const textOffset = bulletOptions.textOffset ?? 12;
      const bulletChar = bulletOptions.bulletChar ?? "\u2022";
      const bulletRadius = bulletOptions.bulletRadius ?? null;

      const lineX = doc.page.margins.left + bulletOffset;
      const textX = lineX + textOffset;
      const maxTextWidth = doc.page.width - doc.page.margins.right - textX;
      const measureOpts = { width: maxTextWidth, align: "left", lineGap: 2 };

      ensureSpace(doc.heightOfString(normalized, measureOpts) + 2);
      const lineY = doc.y;

      if (bulletRadius !== null) {
        const cy = lineY + doc.currentLineHeight(true) / 2;
        doc.circle(lineX + bulletRadius, cy, bulletRadius).fill("#000000");
      } else {
        doc.text(bulletChar, lineX, lineY, { lineBreak: false });
      }

      doc.text(normalized, textX, lineY, measureOpts);
      doc.x = doc.page.margins.left;
    };

    const renderExperienceHeader = (exp) => {
      const x = contentX();
      const w = contentWidth();
      const company = normalizeParagraphText(exp.company);
      const location = normalizeParagraphText(exp.location);
      const title = normalizeParagraphText(exp.title);
      const dates = [exp.start_date, exp.end_date].filter(Boolean).join(" - ");

      doc.fontSize(10);
      const lineHeight = doc.currentLineHeight(true);

      if (company || location) {
        ensureSpace(lineHeight);
        const y = doc.y;
        if (company) doc.font(boldFont).text(company, x, y, { width: w, align: "left", lineBreak: false });
        if (location) doc.font(regularFont).text(location, x, y, { width: w, align: "right", lineBreak: false });
        doc.y = y + lineHeight;
        doc.x = x;
      }
      gapDown(0.2)
      if (title || dates) {
        ensureSpace(lineHeight);
        const y = doc.y;
        if (title) doc.font(boldFont).text(title, x, y, { width: w, align: "left", lineBreak: false });
        if (dates) doc.font(regularFont).text(dates, x, y, { width: w, align: "right", lineBreak: false });
        doc.y = y + lineHeight;
        doc.x = x;
      }

      gapDown(0.4);
    };

    const sectionTitle = (title) => {
      ensureSpace(24);
      doc.fillColor(accentColor).font(boldFont).fontSize(12).text(title.toUpperCase(), {
        align: "left",
      });
      const y = doc.y + 10;
      doc
        .strokeColor(accentColor)
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .stroke();
      doc.fillColor("#000000");
      doc.strokeColor("#000000");
      gapDown(1.5);
    };

    if (buffer.name) {
      doc.fillColor(accentColor).font(boldFont).fontSize(20).text(normalizeParagraphText(buffer.name), {
        align: "center",
      });
      doc.fillColor("#000000");
      gapDown(0.3);
    }

    const headline = normalizeParagraphText(buffer.experience?.[0]?.title);
    if (headline) {
      doc.font(regularFont).fontSize(15).text(headline, { align: "center" });
      gapDown(0.4);
    }

    if (buffer.address) {
      doc.font(regularFont).fontSize(10).text(normalizeParagraphText(buffer.address), { align: "center" });
      gapDown(0.4);
    }

    const inlineParts = [];
    if (buffer.email) inlineParts.push(normalizeParagraphText(buffer.email));
    if (buffer.phone) inlineParts.push(normalizeParagraphText(buffer.phone));
    if (buffer.linkedin) inlineParts.push(normalizeParagraphText(buffer.linkedin));

    if (inlineParts.length) {
      doc.font(regularFont).fontSize(10).text(inlineParts.join(" | "), { align: "center" });
      gapDown(1.3);
    }



    if (buffer.summary) {
      sectionTitle("Summary");
      doc.font(regularFont).fontSize(10).text(normalizeParagraphText(buffer.summary), contentX(), doc.y, {
        width: contentWidth(),
        align: "justify",
        lineGap: 3,
      });
      gapDown(1.0);
    }

    if (Array.isArray(buffer.skills) && buffer.skills.length) {
      sectionTitle("Skills");
      buffer.skills.forEach((row) => {
        if (!Array.isArray(row) || !row.length) return;
        const [first, ...rest] = row;
        const category = normalizeParagraphText(first?.text);
        const restText = rest.map((segment) => normalizeParagraphText(segment?.text)).join("");

        const lineX = doc.page.margins.left;
        const textX = lineX + 12;
        const wrapWidth = doc.page.width - doc.page.margins.right - textX;

        doc.font(boldFont).fontSize(10);
        const catW = doc.widthOfString(category);

        ensureSpace(14);
        const lineY = doc.y;

        doc.text(category, lineX, lineY);

        if (restText) {
          doc.font(regularFont).fontSize(10);
          doc.y = lineY;
          doc.text(restText, textX, lineY, {
            width: wrapWidth,
            indent: catW - 12,
            align: "left",
            lineGap: 2.5,
          });
        }
        doc.x = lineX;
      });
      gapDown(1.0);
    }

    if (Array.isArray(buffer.experience) && buffer.experience.length) {
      sectionTitle("Experience");
      buffer.experience.forEach((exp) => {
        if (!exp) return;
        renderExperienceHeader(exp);
        if (Array.isArray(exp.achievements)) {
          exp.achievements.forEach((achievement) => {
            doc.font(regularFont).fontSize(10);
            renderBulletItem(achievement, { bulletOffset: 2, textOffset: 12, bulletRadius: 2 });
          });
        }
        gapDown(0.6);
      });
      gapDown(1.0);
    }

    if (buffer.education) {
      sectionTitle("Education");
      if (buffer.education.school) {
        doc.font(boldFont).fontSize(10).text(normalizeParagraphText(buffer.education.school), {
          align: "left",
        });
        gapDown(0.2);
      }
      const eduDetails = [];
      if (buffer.education.degree) eduDetails.push(normalizeParagraphText(buffer.education.degree));
      if (buffer.education.start_date || buffer.education.end_date) {
        const dates = [buffer.education.start_date, buffer.education.end_date].filter(Boolean).join(" - ");
        if (dates) eduDetails.push(`(${dates})`);
      }
      if (eduDetails.length) {
        doc.font(regularFont).fontSize(10).text(eduDetails.join(" "), { align: "left" });
      }
      gapDown(1.0);
    }

    if (Array.isArray(buffer.certifications) && buffer.certifications.length) {
      sectionTitle("Certifications");
      buffer.certifications.forEach((cert) => {
        if (!cert || !cert.name) return;
        const certText = cert.site_url ? `${cert.name} -> ${cert.site_url}` : cert.name;
        doc.font(regularFont).fontSize(10);
        renderBulletItem(certText, { bulletOffset: 2, textOffset: 12, bulletRadius: 2.5 });
        
      });
    }

    doc.end();
  });
};
