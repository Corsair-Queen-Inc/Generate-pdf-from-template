const PDFDocument = require("pdfkit");
const path = require("path");
const { resolveFontName, sanitizeColor } = require("../lib/pdfUtils");
const { normalizeParagraphText } = require("../lib/textUtils");

module.exports.createResumePdf = async function createResumePdf(buffer, options = {}) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontsDir = path.join(__dirname, "..", "fonts");
    const requestedRegular = options.fontRegular || "Merriweather-Regular.ttf";
    const requestedBold = options.fontBold || "Merriweather-Bold.ttf";
    const regularFont = resolveFontName(doc, fontsDir, requestedRegular, "Helvetica", "custom-regular");
    const boldFont = resolveFontName(doc, fontsDir, requestedBold, "Helvetica-Bold", "custom-bold");
    const accentColor = sanitizeColor(options.fontColor, "#1f2937");
    const nameAlign = options.nameAlign || "center";
    const contactAlign = options.contactAlign || "center";
    const summaryAlign = options.summaryAlign || "left";

    const contentX = () => doc.page.margins.left;

    const contentWidth = () =>
      doc.page.width - doc.page.margins.right - doc.page.margins.left;

    const renderBulletItem = (text, bulletOptions = {}) => {
      const normalized = normalizeParagraphText(text);
      if (!normalized) return;

      const bulletOffset = bulletOptions.bulletOffset ?? 0;
      const textOffset = bulletOptions.textOffset ?? 12;
      const bulletChar = bulletOptions.bulletChar ?? "•";

      const lineX = doc.page.margins.left + bulletOffset;
      const textX = lineX + textOffset;
      const maxTextWidth = doc.page.width - doc.page.margins.right - textX;

      const measureOpts = { width: maxTextWidth, align: "left" };
      const textHeight = doc.heightOfString(normalized, measureOpts);
      const maxY = doc.page.maxY();
      const fudge = 2;
      if (doc.y + textHeight + fudge > maxY) {
        doc.addPage();
      }
      const lineY = doc.y;

      doc.text(bulletChar, lineX, lineY, { lineBreak: false });
      doc.text(normalized, textX, lineY, measureOpts);

      doc.x = doc.page.margins.left;
    };

    const renderExperienceHeader = (exp) => {
      const x = contentX();
      const w = contentWidth();
      const company = String(exp.company || "").trim();
      const location = String(exp.location || "").trim();
      const title = String(exp.title || "").trim();
      const dates = [exp.start_date, exp.end_date].filter(Boolean).join(" - ");
      const lineHeight = doc.currentLineHeight(true);

      if (company || location) {
        const y = doc.y;
        if (company) {
          doc.font(boldFont).fontSize(9).text(company, x, y, { width: w, align: "left", lineBreak: false });
        }
        if (location) {
          doc.font(regularFont).fontSize(9).text(location, x, y, { width: w, align: "right", lineBreak: false });
        }
        doc.y = y + lineHeight;
        doc.x = x;
      }

      if (title || dates) {
        const y = doc.y;
        if (title) {
          doc.font(boldFont).fontSize(9).text(title, x, y, { width: w, align: "left", lineBreak: false });
        }
        if (dates) {
          doc.font(regularFont).fontSize(9).text(dates, x, y, { width: w, align: "right", lineBreak: false });
        }
        doc.y = y + lineHeight;
        doc.x = x;
      }

      doc.moveDown(0.4);
    };

    const sectionTitle = (title) => {
      doc.fillColor(accentColor).font(boldFont).fontSize(12).text(title.toUpperCase(), { align: "left" });
      const y = doc.y + 2;
      doc
        .strokeColor(accentColor)
        .moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .stroke();
      doc.fillColor("#000000");
      doc.strokeColor("#000000");
      doc.moveDown(0.4);
    };

    // Name
    if (buffer.name) {
      doc.fillColor(accentColor).font(boldFont).fontSize(22);
      if (nameAlign === "center") {
        doc.text(buffer.name, { align: "center" });
      } else {
        doc.text(buffer.name, contentX(), doc.y, {
          width: contentWidth(),
          align: nameAlign,
        });
      }
      doc.fillColor("#000000");
      doc.moveDown(0.4);
    }

    // Contact line
    const contactParts = [];
    if (buffer.address) contactParts.push(buffer.address);
    if (buffer.email) contactParts.push(buffer.email);
    if (buffer.phone) contactParts.push(buffer.phone);
    if (buffer.linkedin) contactParts.push(buffer.linkedin);

    if (contactParts.length) {
      doc.font(regularFont).fontSize(9);
      const contactLine = contactParts.join(" • ");
      if (contactAlign === "center") {
        doc.text(contactLine, { align: "center" });
      } else {
        doc.text(contactLine, contentX(), doc.y, {
          width: contentWidth(),
          align: contactAlign,
        });
      }
      doc.moveDown(0.6);
    }

    // SUMMARY
    if (buffer.summary) {
      sectionTitle("Summary");
      doc.font(regularFont).fontSize(9).text(buffer.summary, contentX(), doc.y, {
        width: contentWidth(),
        align: summaryAlign,
      });
      // Larger gap after summary block
      doc.moveDown(1.0);
    }

    // SKILLS
    if (Array.isArray(buffer.skills) && buffer.skills.length) {
      sectionTitle("Skills");
      buffer.skills.forEach((row) => {
        if (!row || !row.length) return;
        const [first, ...rest] = row;
        const category = first?.text || "";
        const restText = rest.map((s) => s.text || "").join("");

        doc
          .font(boldFont)
          .fontSize(9)
          .text(category, { continued: !!restText });

        if (restText) {
          doc
            .font(regularFont)
            .fontSize(9)
            .text(restText, { align: "left" });
        } else {
          doc.text("");
        }
      });
      // Normal gap after skills block
      doc.moveDown(1.0);
    }

    // EXPERIENCE
    if (Array.isArray(buffer.experience) && buffer.experience.length) {
      sectionTitle("Experience");
      buffer.experience.forEach((exp) => {
        if (!exp) return;
        renderExperienceHeader(exp);

        if (Array.isArray(exp.achievements)) {
          exp.achievements.forEach((a) => {
            if (!a) return;
            doc.font(regularFont).fontSize(9);
            renderBulletItem(a, { bulletOffset: 2, textOffset: 10 });
          });
        }
        // Small gap between individual experiences
        doc.moveDown(0.6);
      });
      // Normal gap after entire experience section before education
      doc.moveDown(1.0);
    }

    // EDUCATION
    if (buffer.education) {
      sectionTitle("Education");
      if (buffer.education.school) {
        doc.font(boldFont).fontSize(9).text(buffer.education.school, { align: "left" });
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
        doc
          .font(regularFont)
          .fontSize(9)
          .text(eduDetails.join(" "), { align: "left" });
      }
      doc.moveDown(1.0);
    }

    // CERTIFICATIONS
    if (Array.isArray(buffer.certifications) && buffer.certifications.length) {
      sectionTitle("Certifications");
      buffer.certifications.forEach((cert) => {
        if (!cert || !cert.name) return;
        const certText = cert.site_url ? `${cert.name} — ${cert.site_url}` : cert.name;
        doc.font(regularFont).fontSize(9);
        renderBulletItem(certText, { bulletOffset: 2, textOffset: 10 });
      });
    }

    doc.end();
  });
};;
