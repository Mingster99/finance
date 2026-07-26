# Finance

Personal finance system. Two parts:

## Dashboard (`/dashboard`)
Next.js app deployed on Vercel. Reads a private Google Sheet and renders
net worth, cash flow, and spending by category as an iOS PWA.

See `dashboard/README.md` for setup and env vars.

## Parser (`/parser`)
Local Python app. Runs on your Mac at `localhost:8765`.
Turns UOB `.xlsx` exports into CSVs ready to import into Google Sheets.

Double-click `parser/run.command` to start it.

See `parser/README.md` for the monthly workflow.
