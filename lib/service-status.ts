import { getServiceEventCollection, getTpaCollection, toTpa } from "./db";
import type { EnvironmentKey, ServiceKey } from "./types";
import { canonicalTpaName, normalizeTpaName } from "./tpa-aliases";

const serviceAliases: Record<string, ServiceKey> = {
  networkhospital: "networkHospital",
  claimshistory: "claimsHistory",
  ecard: "ecard",
  claimintimation: "claimIntimation",
  claimsubmission: "claimSubmission",
  activelistenrollment: "activeListEnrollment",
  enrollment: "activeListEnrollment",
  blacklistedhospitals: "blacklistedHospitals",
};

export const allowedServices = ["networkHospital", "claimsHistory", "ecard", "claimIntimation", "claimSubmission", "activeListEnrollment", "blacklistedHospitals"] as const;

export function parseServiceName(value: string) {
  return serviceAliases[value.toLowerCase().replace(/[^a-z0-9]/g, "")];
}

export function parseStatus(value: unknown): "pass" | "fail" | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === "pass" || normalized === "fail" ? normalized : undefined;
}

export function parseEnvironment(value: unknown): EnvironmentKey | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === "uat" || normalized === "prod" ? normalized : undefined;
}

export async function setServiceStatus(input: { tpaName: string; serviceName: string; environment: EnvironmentKey; status: "pass" | "fail"; reason?: string; occurredAt?: string }) {
  const serviceKey = parseServiceName(input.serviceName);
  if (!serviceKey) return { error: "Unknown serviceName.", statusCode: 400 as const };
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) return { error: "occurredAt must be a valid ISO 8601 date and time.", statusCode: 400 as const };

  const requestedName = canonicalTpaName(input.tpaName) ?? input.tpaName;
  const normalizedName = normalizeTpaName(requestedName);
  const updated = await (await getTpaCollection()).findOneAndUpdate(
    { $or: [{ normalizedName }, { normalizedAliases: normalizedName }] },
    { $set: { [`environments.${input.environment}.${serviceKey}`]: input.status === "pass", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) return { error: `TPA '${input.tpaName}' was not found.`, statusCode: 404 as const };

  const event = {
    tpaId: updated._id,
    tpaName: updated.name,
    serviceName: serviceKey,
    status: input.status,
    environment: input.environment,
    reason: input.reason?.trim() || undefined,
    occurredAt,
    reportedAt: new Date(),
  };
  const result = await (await getServiceEventCollection()).insertOne(event);
  return { eventId: result.insertedId.toHexString(), serviceName: serviceKey, booleanValue: input.status === "pass", tpa: toTpa(updated) };
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  };
}

export function isAuthorized(request: Request) {
  const apiKey = process.env.STATUS_API_KEY;
  return !apiKey || request.headers.get("x-api-key") === apiKey;
}
