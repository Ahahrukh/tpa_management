import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type { Tpa } from "./types";

const dataDirectory = path.join(process.cwd(), "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const database = new DatabaseSync(path.join(dataDirectory, "tpa.db"));

database.exec(`
  CREATE TABLE IF NOT EXISTS tpas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    network_hospital INTEGER NOT NULL DEFAULT 0 CHECK(network_hospital IN (0, 1)),
    claims_history INTEGER NOT NULL DEFAULT 0 CHECK(claims_history IN (0, 1)),
    ecard INTEGER NOT NULL DEFAULT 0 CHECK(ecard IN (0, 1)),
    claim_intimation INTEGER NOT NULL DEFAULT 0 CHECK(claim_intimation IN (0, 1)),
    claim_submission INTEGER NOT NULL DEFAULT 0 CHECK(claim_submission IN (0, 1)),
    active_list_enrollment INTEGER NOT NULL DEFAULT 0 CHECK(active_list_enrollment IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

type DbRow = {
  id: number;
  name: string;
  network_hospital: number;
  claims_history: number;
  ecard: number;
  claim_intimation: number;
  claim_submission: number;
  active_list_enrollment: number;
  created_at: string;
  updated_at: string;
};

export function toTpa(row: DbRow): Tpa {
  return {
    id: row.id,
    name: row.name,
    networkHospital: Boolean(row.network_hospital),
    claimsHistory: Boolean(row.claims_history),
    ecard: Boolean(row.ecard),
    claimIntimation: Boolean(row.claim_intimation),
    claimSubmission: Boolean(row.claim_submission),
    activeListEnrollment: Boolean(row.active_list_enrollment),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default database;
