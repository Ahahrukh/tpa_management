import { NextResponse } from "next/server";
import { getTpaCollection, toTpa, type TpaDocument } from "@/lib/db";
import { SERVICE_KEYS, type EnvironmentKey, type ServiceKey, type ServiceValue, type Tpa, type TpaEnvironment } from "@/lib/types";
import { authorize } from "@/lib/auth";
import { normalizeTpaName } from "@/lib/tpa-aliases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  try {
    const documents = await (await getTpaCollection()).find().sort({ name: 1 }).toArray();
    return NextResponse.json(documents.map(toTpa));
  } catch (error) {
    console.error("MongoDB TPA read failed", error);
    return NextResponse.json({ error: "Could not connect to the TPA database." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, "add");
  if ("response" in auth) return auth.response;
  const body = (await request.json()) as Partial<Tpa>;
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "TPA name is required." }, { status: 400 });

  const now = new Date();
  const makeEnvironment = (key: EnvironmentKey): TpaEnvironment => {
    const supplied = body.environments?.[key];
    return Object.assign(
      Object.fromEntries(SERVICE_KEYS.map((service) => [service, supplied?.[service] ?? (service === "blacklistedHospitals" ? null : false)])) as Record<ServiceKey, ServiceValue>,
      { review: supplied?.review?.trim() ?? "" },
    );
  };
  const document: TpaDocument = {
    name,
    normalizedName: normalizeTpaName(name),
    aliases: Array.isArray(body.aliases) ? body.aliases.filter((alias): alias is string => typeof alias === "string").map((alias) => alias.trim()).filter(Boolean) : [],
    normalizedAliases: Array.isArray(body.aliases) ? body.aliases.filter((alias): alias is string => typeof alias === "string").map(normalizeTpaName).filter(Boolean) : [],
    environments: { uat: makeEnvironment("uat"), prod: makeEnvironment("prod") },
    createdAt: now,
    updatedAt: now,
  };

  try {
    const result = await (await getTpaCollection()).insertOne(document);
    return NextResponse.json(toTpa({ ...document, _id: result.insertedId }), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("E11000")) return NextResponse.json({ error: "A TPA with this name already exists." }, { status: 409 });
    console.error("MongoDB TPA create failed", error);
    return NextResponse.json({ error: "Could not save the TPA." }, { status: 503 });
  }
}
