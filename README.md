# TPA Pulse

A Next.js dashboard for tracking which services are working for each Third Party Administrator (TPA).

## Features

- Add and remove TPAs
- Track six operational services with green checks and red crosses
- Persist every change to a local SQLite database
- Search TPAs and see overall readiness metrics
- Export all data as an Excel-compatible CSV sheet

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database is created automatically at `data/tpa.db`.
