const PDFDocument = require("pdfkit");
const path = require("path");
const { resolveFontName } = require("../lib/pdfUtils");

function sanitizeColor(color, fallback = "#5c6e1f") {
  if (typeof color !== "string") return fallback;
  const trimmed = color.trim();
  return /^#([0-9A-Fa-f]{6})$/.test(trimmed) ? trimmed : fallback;
}

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

function employerLocation(exp) {
  return String(exp.employeer_location || exp.location || "").trim();
}

function formatDateRange(start, end) {
  return [start, end]
    .filter(Boolean)
    .map((d) => String(d).replace(/\s+/g, " ").trim())
    .join(" - ");
}

const DATES_COLUMN_WIDTH = 110;

function renderCompanyRow(doc, { marginLeft, marginRight, pageWidth, contentWidth, companyY, companyText, dates, regularFont }) {
  const lineHeight = doc.currentLineHeight(true);
  const datesX = pageWidth - marginRight - DATES_COLUMN_WIDTH;
  const companyWidth = contentWidth - DATES_COLUMN_WIDTH;

  if (companyText) {
    doc
      .fillColor("#444444")
      .font(regularFont)
      .fontSize(10)
      .text(companyText, marginLeft, companyY, { width: companyWidth, lineBreak: false });
  }
  if (dates) {
    doc
      .fillColor("#444444")
      .font(regularFont)
      .fontSize(10)
      .text(dates, datesX, companyY, {
        width: DATES_COLUMN_WIDTH,
        align: "right",
        lineBreak: false,
      });
  }
  doc.y = companyY + lineHeight;
  doc.x = marginLeft;
}

module.exports.createResumePdfA = async function createResumePdfA(data, options = {}) {
  return await new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: 50, bottom: 50, left: 45, right: 45 },
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fontsDir = path.join(__dirname, "..", "fonts");
    const requestedRegular = options.fontRegular || "Merriweather-Regular.ttf";
    const requestedBold = options.fontBold || "Merriweather-Bold.ttf";
    const regularFont = resolveFontName(doc, fontsDir, requestedRegular, "Helvetica", "stylea-regular");
    const boldFont = resolveFontName(doc, fontsDir, requestedBold, "Helvetica-Bold", "stylea-bold");
    const accentColor = sanitizeColor(options.fontColor, "#5c6e1f");

    const pageWidth = doc.page.width;
    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const marginTop = doc.page.margins.top;
    const contentWidth = pageWidth - marginLeft - marginRight;

    const drawBackground = () => {
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill("#EDF3DB");
      doc.restore();
    };
    drawBackground();
    doc.on("pageAdded", drawBackground);

    const renderInlineText = (text, x, y, { fontSize = 10, ...textOpts } = {}) => {
      const segments = parseBoldSegments(text);
      const hasBold = segments.some((s) => s.bold);
      if (!hasBold) {
        doc.font(regularFont).fontSize(fontSize).text(text, x, y, textOpts);
        return;
      }
      segments.forEach((seg, i) => {
        const isLast = i === segments.length - 1;
        doc.font(seg.bold ? boldFont : regularFont).fontSize(fontSize);
        if (i === 0) {
          doc.text(seg.text, x, y, { ...textOpts, continued: !isLast });
        } else {
          doc.text(seg.text, { continued: !isLast });
        }
      });
      doc.x = marginLeft;
    };

    const renderBulletInline = (text, bulletOpts = {}) => {
      if (!text) return;
      const bulletOffset = bulletOpts.bulletOffset ?? 2;
      const textOffset = bulletOpts.textOffset ?? 12;
      const plainText = text.replace(/\*\*/g, "");
      let lineY = doc.y;
      const lineX = marginLeft + bulletOffset;
      const textX = lineX + textOffset;
      const maxWidth = pageWidth - marginRight - textX;
      const textHeight = doc.heightOfString(plainText, { width: maxWidth });
      if (lineY + textHeight + 2 > doc.page.maxY()) {
        doc.addPage();
        lineY = doc.y;
      }
      doc.font(regularFont).fontSize(10).text("•", lineX, lineY, { lineBreak: false });
      renderInlineText(text, textX, lineY, { width: maxWidth, align: "left" });
    };

    const nameColWidth = contentWidth * 0.55;
    const contactColX = marginLeft + nameColWidth + 10;
    const contactColWidth = contentWidth - nameColWidth - 10;

    if (data.name) {
      doc
        .fillColor(accentColor)
        .font(boldFont)
        .fontSize(30)
        .text(data.name, marginLeft, marginTop, { width: nameColWidth, lineBreak: false });
    }

    const headline = data.experience?.[0]?.title || "";
    if (headline) {
      doc
        .fillColor(accentColor)
        .font(boldFont)
        .fontSize(14)
        .text(headline, marginLeft, marginTop + 36, { width: nameColWidth });
    }

    const contactLines = [data.address, data.phone, data.email, data.linkedin].filter(Boolean);
    contactLines.forEach((line, i) => {
      doc
        .fillColor("#444444")
        .font(regularFont)
        .fontSize(10)
        .text(line, contactColX, marginTop + i * 13, { width: contactColWidth, align: "right" });
    });

    const ruleY = Math.max(marginTop + 52, marginTop + contactLines.length * 13 + 8);
    doc.save();
    doc
      .strokeColor(accentColor)
      .lineWidth(0.75)
      .moveTo(marginLeft, ruleY)
      .lineTo(pageWidth - marginRight, ruleY)
      .stroke();
    doc.restore();

    doc.fillColor("#000000").strokeColor("#000000");
    doc.y = ruleY + 10;
    doc.x = marginLeft;

    const sectionTitle = (title) => {
      doc.moveDown(0.4);
      doc.fillColor(accentColor).font(boldFont).fontSize(14).text(title, { align: "left" });
      doc.fillColor("#000000");
      doc.moveDown(0.3);
    };

    const renderSkillBullet = (category, restText) => {
      const cleanCategory = category.replace(/\*\*/g, "");
      const cleanRest = restText.replace(/\*\*/g, "");
      const textWidth = contentWidth - 12;
      const textHeight = doc.heightOfString(`${cleanCategory}${cleanRest}`, { width: textWidth });
      if (doc.y + textHeight + 2 > doc.page.maxY()) doc.addPage();
      const lineY = doc.y;
      doc
        .fillColor("#000000")
        .font(regularFont)
        .fontSize(10)
        .text("•", marginLeft + 2, lineY, { lineBreak: false, width: 10 });
      doc
        .font(boldFont)
        .fontSize(10)
        .text(cleanCategory, marginLeft + 12, lineY, { continued: !!cleanRest, width: textWidth });
      if (cleanRest) {
        doc.font(regularFont).fontSize(10).text(cleanRest, { align: "left" });
      } else {
        doc.moveDown();
      }
      doc.x = marginLeft;
    };

    if (data.summary) {
      sectionTitle("Summary");
      renderInlineText(data.summary, marginLeft, doc.y, { width: contentWidth, align: "left" });
      doc.moveDown(0.6);
    }

    if (data.core_expertise) {
      sectionTitle("Core Expertise");
      doc.font(boldFont).fontSize(10).text(data.core_expertise, { align: "left" });
      doc.moveDown(0.6);
    }

    if (Array.isArray(data.skills) && data.skills.length) {
      sectionTitle("Core Skills");
      data.skills.forEach((row) => {
        if (!row || !row.length) return;
        const [first, ...rest] = row;
        renderSkillBullet(first?.text || "", rest.map((s) => s.text || "").join(""));
      });
      doc.moveDown(0.6);
    }

    if (Array.isArray(data.experience) && data.experience.length) {
      sectionTitle("Professional Experiences");
      data.experience.forEach((exp) => {
        if (!exp) return;
        const dates = formatDateRange(exp.start_date, exp.end_date);
        const title = String(exp.title || "");
        const loc = employerLocation(exp);
        const companyText = loc ? `${exp.company || ""} - ${loc}` : String(exp.company || "");

        if (doc.y + 55 > doc.page.maxY()) doc.addPage();

        doc.fillColor(accentColor).font(boldFont).fontSize(12).text(title, { align: "left" });
        doc.fillColor("#000000");

        const companyY = doc.y;
        renderCompanyRow(doc, {
          marginLeft,
          marginRight,
          pageWidth,
          contentWidth,
          companyY,
          companyText,
          dates,
          regularFont,
        });
        doc.fillColor("#000000");
        doc.moveDown(0.35);

        if (Array.isArray(exp.achievements)) {
          exp.achievements.forEach((a) => {
            if (!a) return;
            renderBulletInline(a, { bulletOffset: 2, textOffset: 12 });
          });
        }

        if (exp.environment) {
          const envText = String(exp.environment).replace(/\*\*/g, "");
          const plainEnv = `Environment: ${envText}`;
          const envHeight = doc.heightOfString(plainEnv, { width: contentWidth });
          if (doc.y + envHeight + 6 > doc.page.maxY()) doc.addPage();
          doc.moveDown(0.2);
          renderInlineText(`**Environment:** ${envText}`, marginLeft, doc.y, {
            width: contentWidth,
            align: "left",
          });
          doc.x = marginLeft;
        }

        doc.moveDown(0.5);
      });
    }

    if (data.education) {
      sectionTitle("Education");
      if (data.education.degree) {
        doc.fillColor(accentColor).font(boldFont).fontSize(10).text(data.education.degree, { align: "left" });
        doc.fillColor("#000000");
      }
      const eduY = doc.y;
      const eduDates = formatDateRange(data.education.start_date, data.education.end_date);
      const schoolText = data.education.location
        ? `${data.education.school || ""} - ${data.education.location}`
        : data.education.school || "";
      renderCompanyRow(doc, {
        marginLeft,
        marginRight,
        pageWidth,
        contentWidth,
        companyY: eduY,
        companyText: schoolText,
        dates: eduDates,
        regularFont,
      });
      doc.fillColor("#000000");
      doc.moveDown(0.6);
    }

    if (Array.isArray(data.certifications) && data.certifications.length) {
      sectionTitle("Certifications");
      data.certifications.forEach((cert) => {
        if (!cert || !cert.name) return;
        const certText = cert.site_url ? `${cert.name} ${cert.site_url}` : cert.name;
        doc.fontSize(10);
        renderBulletInline(certText, { bulletOffset: 2, textOffset: 12 });
      });
    }

    doc.end();
  });
};
