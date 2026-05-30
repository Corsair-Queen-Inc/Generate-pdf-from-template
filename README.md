# Generate PDF from Template

Build a resume PDF from a template and a JSON data file (Node.js + PDFKit).

## Setup & run

```bash
npm install
node generate.js classic.js data.txt resume.pdf
```

## Command

```bash
node generate.js [template.js] [data.txt] [output.pdf]
```

Defaults: `classic.js`, `data.txt`, `resume.pdf`.

## Files

- **classic.js** — layout template
- **data.txt** — JSON with `summary`, `skills`, `experience`
- **generate.js** — runner; edit `CONTACT_DATA` for name, email, phone, and education
