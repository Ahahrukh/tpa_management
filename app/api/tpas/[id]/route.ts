import { NextResponse } from "next/server";
import database, { toTpa } from "@/lib/db";
import { SERVICE_KEYS, type ServiceKey } from "@/lib/types";

export const runtime = "nodejs";

const columnMap: Record<ServiceKey, string> = {
  networkHospital: "network_hospital",
  claimsHistory: "claims_history",
  ecard: "ecard",
  claimIntimation: "claim_intimation",
  claimSubmission: "claim_submission",
  activeListEnrollment: "active_list_enrollment",
};

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const numericId = Number(id);
  const body = (await request.json()) as { field?: string; value?: unknown };

  if (!Number.isInteger(numericId) || !SERVICE_KEYS.includes(body.field as ServiceKey) || typeof body.value !== "boolean") {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const column = columnMap[body.field as ServiceKey];
  const result = database
    .prepare(`UPDATE tpas SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(Number(body.value), numericId);

  if (result.changes === 0) {
    return NextResponse.json({ error: "TPA not found." }, { status: 404 });
  }

  const row = database.prepare("SELECT * FROM tpas WHERE id = ?").get(numericId);
  return NextResponse.json(toTpa(row as Parameters<typeof toTpa>[0]));
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: "Invalid TPA id." }, { status: 400 });
  }

  const result = database.prepare("DELETE FROM tpas WHERE id = ?").run(numericId);
  if (result.changes === 0) {
    return NextResponse.json({ error: "TPA not found." }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
