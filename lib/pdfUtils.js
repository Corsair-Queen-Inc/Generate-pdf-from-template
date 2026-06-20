const path = require("path");
const fs = require("fs");

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

function resolveFontsDir(...candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || candidates[0];
}

function sanitizeColor(color, fallback = "#1f2937") {
  if (typeof color !== "string") return fallback;
  const trimmed = color.trim();
  return /^#([0-9A-Fa-f]{6})$/.test(trimmed) ? trimmed : fallback;
}

/** Resolve Calibri regular / bold / italic from fonts dir or Windows. */
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

module.exports = {
  BUILT_IN_FONTS,
  resolveFontName,
  resolveFontsDir,
  resolveClassicFonts,
  sanitizeColor,
};
