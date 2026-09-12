import { NextResponse } from "next/server";
import { getServiceEventCollection, toServiceFailure } from "@/lib/db";
import { corsHeaders, isAuthorized, parseEnvironment, setServiceStatus } from "@/lib/service-status";
import { authorize } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const tpaName = url.searchParams.get("tpaName")?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const escapedName = tpaName?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const filter = {
    status: "fail" as const,
    ...(escapedName ? { tpaName: { $regex: `^${escapedName}$`, $options: "i" } } : {}),
  };
  const documents = await (await getServiceEventCollection()).find(filter).sort({ occurredAt: -1 }).limit(limit).toArray();
  return NextResponse.json({ failures: documents.map(toServiceFailure) }, { headers: corsHeaders() });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401, headers: corsHeaders() });
  const payload = (await request.json()) as Record<string, unknown>;
  const tpaName = typeof payload.tpaName === "string" ? payload.tpaName.trim() : "";
  const serviceName = typeof payload.serviceName === "string" ? payload.serviceName.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const failedAt = typeof payload.failedAt === "string" ? payload.failedAt : undefined;
  const environment = parseEnvironment(payload.environment);
  if (!tpaName || !serviceName || !reason || !environment) return NextResponse.json({ error: "tpaName, serviceName, environment, and reason are required." }, { status: 400, headers: corsHeaders() });
  const result = await setServiceStatus({ tpaName, serviceName, environment, status: "fail", reason, occurredAt: failedAt });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.statusCode, headers: corsHeaders() });
  return NextResponse.json({ message: `${result.serviceName} marked as not working for ${result.tpa.name}.`, tpa: result.tpa }, { status: 201, headers: corsHeaders() });
}
