# Generate PDF from Template

Build a resume PDF from a JSON data file and a PDFKit template (Node.js).

## Quick start

```bash
npm install
npm run generate        # styleD.js + data.txt → resume.pdf
```

Or pass arguments explicitly:

```bash
node generate.js [template.js] [data.txt] [output.pdf]
```

Defaults: `styleD.js`, `data.txt`, `resume.pdf`.

## Templates

| File | Style | Font | Accent |
|------|-------|------|--------|
| `classic.js` | Clean, no section rules | Calibri (falls back to Helvetica) | Teal `#00786C` |
| `styleD.js` | Centered header, section underlines | EB Garamond (`.woff`) | Dark `#1A1A1A` |
| `styleE.js` | Small-caps name, 3-column skills grid | EB Garamond (`.ttf`) | Black |

### Accent color override

Pass `--fontColor` via options (programmatic use) to override the accent color at runtime.

## Contact data

Name, email, phone, address, LinkedIn, and education are **hardcoded** in `generate.js`. Edit the `CONTACT_DATA` object near the top of the file:

```js
const CONTACT_DATA = {
  name: "Your Name",
  email: "you@email.com",
  phone: "(555) 000-0000",
  address: "City, ST",
  linkedin: "linkedin.com/in/your-handle",
  education: {
    school: "University Name",
    degree: "Bachelor of Science in ...",
    start_date: "2010",
    end_date: "2014",
  },
};
```

## Data file (`data.txt`)

A JSON file with three top-level keys. All other contact fields come from `CONTACT_DATA`.

```json
{
  "summary": "One-paragraph professional summary.",

  "skills": [
    [
      { "text": "Category Name" },
      { "text": ": " },
      { "text": "Comma-separated skill list" }
    ]
  ],

  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "start_date": "Mon YYYY",
      "end_date": "Mon YYYY",
      "location": "City, ST",
      "achievements": [
        "Bullet point one.",
        "Bullet point two."
      ]
    }
  ]
}
```

### Optional fields

| Field | Where | Notes |
|-------|-------|-------|
| `location` | experience entry | Rendered next to company name |
| `environment` | experience entry | Shown after bullets (styleE only); supports `**bold**` |
| `certifications` | top-level array | `[{ "name": "Cert Name", "site_url": "url" }]` |

### Inline bold (styleE only)

Wrap text in `**double asterisks**` inside achievement strings or `environment` to render it bold.

## Dev server (watch mode)

Auto-regenerates the PDF every time the template file is saved:

```bash
npm run watch
# or
node watch.js [template.js] [data.txt] [output.pdf]
```

Defaults: `styleD.js`, `data.txt`, `resume.pdf`.

## Fonts

Templates look for font files in the `fonts/` directory at the project root.

| Template | Required files |
|----------|---------------|
| `classic.js` | `calibri.ttf` / `calibrib.ttf` / `calibrii.ttf` — or falls back to system Calibri on Windows, then Helvetica |
| `styleD.js` | `EBGaramond-Regular.woff`, `EBGaramond-Bold.woff` |
| `styleE.js` | `EBGaramond-Regular.ttf`, `EBGaramond-Bold.ttf` |

If a font file is missing the template falls back to Helvetica / Helvetica-Bold automatically.

## Project structure

```
generate.js      main runner (edit CONTACT_DATA here)
data.txt         resume content as JSON
classic.js       Classic template
styleD.js        Style D template
styleE.js        Style E template
watch.js         file watcher for live preview
fonts/           custom font files (.ttf / .woff)
lib/
  pdfUtils.js    font resolution, color sanitization
  textUtils.js   text normalization, data sanitization
```

## Sections rendered

Every template renders the following sections (when data is present):

1. Name & contact line
2. Summary
3. Skills
4. Experience
5. Education
6. Certifications
