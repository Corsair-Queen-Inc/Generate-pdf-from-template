/** Collapse whitespace/newlines from model output into a single line for PDF layout. */
function normalizeParagraphText(value) {
  return String(value ?? "")
    // Unicode dashes/hyphens -> ASCII hyphen. PDFKit can mis-measure some dash glyphs.
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/[\u00A0\u202F\u2007]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Coerce achievement bullets to plain strings. */
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

module.exports = {
  normalizeParagraphText,
  achievementToString,
  sanitizeResumeBuffer,
};
