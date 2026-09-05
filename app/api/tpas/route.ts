import { NextResponse } from "next/server";
import database, { toTpa } from "@/lib/db";
import type { Tpa } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = database.prepare("SELECT * FROM tpas ORDER BY name ASC").all();
  return NextResponse.json(rows.map((row) => toTpa(row as Parameters<typeof toTpa>[0])));
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<Tpa>;
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "TPA name is required." }, { status: 400 });
  }

  try {
    const result = database
      .prepare(`
        INSERT INTO tpas (
          name, network_hospital, claims_history, ecard,
          claim_intimation, claim_submission, active_list_enrollment
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        name,
        Number(Boolean(body.networkHospital)),
        Number(Boolean(body.claimsHistory)),
        Number(Boolean(body.ecard)),
        Number(Boolean(body.claimIntimation)),
        Number(Boolean(body.claimSubmission)),
        Number(Boolean(body.activeListEnrollment)),
      );

    const row = database.prepare("SELECT * FROM tpas WHERE id = ?").get(result.lastInsertRowid);
    return NextResponse.json(toTpa(row as Parameters<typeof toTpa>[0]), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return NextResponse.json({ error: "A TPA with this name already exists." }, { status: 409 });
    }
    throw error;
  }
}
