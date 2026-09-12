import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getServiceEventCollection, getTpaCollection, toTpa } from "@/lib/db";
import { SERVICE_KEYS, type ServiceKey } from "@/lib/types";
import { authorize } from "@/lib/auth";
import { parseEnvironment } from "@/lib/service-status";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorize(request, "edit");
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  const body = (await request.json()) as { field?: string; value?: unknown; environment?: unknown; review?: unknown };
  const environment = parseEnvironment(body.environment);
  if (!environment) return NextResponse.json({ error: "environment must be 'uat' or 'prod'." }, { status: 400 });
  if (typeof body.review === "string") {
    const document = await (await getTpaCollection()).findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { [`environments.${environment}.review`]: body.review.trim().slice(0, 2000), updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!document) return NextResponse.json({ error: "TPA not found." }, { status: 404 });
    return NextResponse.json(toTpa(document));
  }
  const isOptionalNull = body.field === "blacklistedHospitals" && body.value === null;
  if (!ObjectId.isValid(id) || !SERVICE_KEYS.includes(body.field as ServiceKey) || (typeof body.value !== "boolean" && !isOptionalNull)) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const document = await (await getTpaCollection()).findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { [`environments.${environment}.${body.field as ServiceKey}`]: body.value as boolean | null, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!document) return NextResponse.json({ error: "TPA not found." }, { status: 404 });
  return NextResponse.json(toTpa(document));
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await authorize(request, "delete");
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid TPA id." }, { status: 400 });
  const objectId = new ObjectId(id);
  const result = await (await getTpaCollection()).deleteOne({ _id: objectId });
  if (!result.deletedCount) return NextResponse.json({ error: "TPA not found." }, { status: 404 });
  await (await getServiceEventCollection()).deleteMany({ tpaId: objectId });
  return new NextResponse(null, { status: 204 });
}
