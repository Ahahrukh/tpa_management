# TPA Pulse

A Next.js dashboard for tracking which services are working for each Third Party Administrator (TPA).

## Features

- Add and remove TPAs
- Track six operational services with green checks and red crosses
- Optionally track Blacklisted Hospitals per TPA (`null` means not tracked)
- Persist every change to a local SQLite database
- Search TPAs and see overall readiness metrics
- Export all data as an Excel-compatible CSV sheet
- Report service failures through an integration API

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Data is stored in MongoDB Atlas using `MONGODB_URI` and `MONGODB_DB` from `.env.local`.

## Backend status API

Use `POST /api/service-status` from your backend to mark a TPA service as passing or failing:

```bash
curl -X POST https://your-domain.com/api/service-status \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-status-api-key" \
  -d '{
    "tpaName": "FHPL",
    "serviceName": "networkHospital",
    "environment": "prod",
    "status": "fail"
  }'
```

`environment` must be `uat` or `prod`. `status` must be `pass` or `fail`: pass stores `true`, while fail stores `false` only for the selected environment. Optional fields are `reason` and `occurredAt`. TPA and service names are matched case-insensitively, and readable names such as `Network Hospital` are supported.

The dashboard has separate UAT and Production views. Each TPA also has a View Details popup showing both environments, all service states, and a separate review for UAT and Production. Users need edit permission to change reviews.

Seed the develop-branch TPA list into UAT without changing existing Production statuses:

```bash
npm run seed:uat
```

## Login and permissions

The dashboard uses server-enforced login sessions stored in signed, HTTP-only cookies. Passwords are hashed with scrypt before being stored in MongoDB.

- `Admin` has full access and can manage user permissions.
- `Aravind_Raha` starts with view-only access.
- Admin can independently grant add, edit, delete, and export permissions from the Permissions panel.

Set `AUTH_SECRET`, `INITIAL_ADMIN_PASSWORD`, and `INITIAL_VIEWER_PASSWORD` in `.env.local` or your deployment environment. The initial passwords are only used to create missing users; changing those environment variables does not overwrite an existing user's stored password.

## Service failure API

Send a `POST` request to `/api/service-failures`. The API records the failure and changes the matching service to `false` in the TPA database in one transaction.

```bash
curl -X POST http://localhost:3000/api/service-failures \
  -H "Content-Type: application/json" \
  -H "X-API-Key: replace-with-a-long-random-secret" \
  -d '{
    "tpaName": "FHPL",
    "serviceName": "networkHospital",
    "reason": "TPA gateway timed out",
    "failedAt": "2026-09-05T10:30:00+05:30"
  }'
```

Required JSON fields:

| Field | Example | Description |
| --- | --- | --- |
| `tpaName` | `FHPL` | Existing TPA name; matching is case-insensitive |
| `serviceName` | `networkHospital` | Service key or readable label such as `Network Hospital` |
| `reason` | `TPA gateway timed out` | Why the service failed |
| `failedAt` | `2026-09-05T10:30:00+05:30` | ISO 8601 date and time, preferably including timezone |

Allowed service names are `networkHospital`, `claimsHistory`, `ecard`, `claimIntimation`, `claimSubmission`, `activeListEnrollment`, and `blacklistedHospitals`. Spaces, hyphens, capitalization, and `/` are ignored, so `Network Hospital` and `networkHospital` both work.

Read recent failures with:

```text
GET /api/service-failures
GET /api/service-failures?tpaName=FHPL&limit=20
```

The current service status for every TPA remains available at:

```text
GET /api/tpas
```

For calls from another website, copy `.env.example` to `.env.local`, set `ALLOWED_ORIGIN` to that website's origin, and restart the app.

For a public deployment, also set `STATUS_API_KEY` and include it in the `X-API-Key` request header. If `STATUS_API_KEY` is not configured, the endpoint remains open for easier local development. Never expose this key in browser-side JavaScript; call the endpoint from your website's server or backend.

The dashboard refreshes automatically every 10 seconds and whenever the browser window regains focus, so failures reported by another system appear without a manual page reload.
