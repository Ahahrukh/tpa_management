import { NextResponse } from "next/server";
import { allowedServices, corsHeaders, isAuthorized, parseEnvironment, parseStatus, setServiceStatus } from "@/lib/service-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401, headers: corsHeaders() });
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400, headers: corsHeaders() });
  }

  const tpaName = typeof payload.tpaName === "string" ? payload.tpaName.trim() : "";
  const serviceName = typeof payload.serviceName === "string" ? payload.serviceName.trim() : "";
  const status = parseStatus(payload.status);
  const environment = parseEnvironment(payload.environment);
  if (!tpaName || !serviceName || !status || !environment) {
    return NextResponse.json({ error: "tpaName, serviceName, environment ('uat' or 'prod'), and status ('pass' or 'fail') are required.", allowedServices }, { status: 400, headers: corsHeaders() });
  }

  try {
    const result = await setServiceStatus({
      tpaName,
      serviceName,
      environment,
      status,
      reason: typeof payload.reason === "string" ? payload.reason : undefined,
      occurredAt: typeof payload.occurredAt === "string" ? payload.occurredAt : undefined,
    });
    if ("error" in result) return NextResponse.json({ error: result.error, allowedServices }, { status: result.statusCode, headers: corsHeaders() });
    return NextResponse.json({ message: `${result.serviceName} marked ${status} for ${result.tpa.name}.`, ...result }, { headers: corsHeaders() });
  } catch (error) {
    console.error("MongoDB service status update failed", error);
    return NextResponse.json({ error: "Could not update service status." }, { status: 503, headers: corsHeaders() });
  }
}
