import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorize } from "@/lib/auth";
import { getTpaReportCollection, toTpaReport, type TpaReportDocument } from "@/lib/db";
import { REPORT_TEST_APIS, type EnvironmentKey, type ReportTestApiKey } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const uploadUrl = () =>
  `${(process.env.RAHA_BACKEND_URL || "https://prodbackend.rahainsure.com").replace(/\/$/, "")}/api/v2/raha_user_master/file/upload`;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message, message }, { status });
}

function readString(form: FormData, field: string) {
  const value = form.get(field);
  return typeof value === "string" ? value.trim() : "";
}

function extractFileUrl(payload: unknown): string | null {
  if (typeof payload === "string") return payload.startsWith("http") ? payload : null;
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of ["url", "file_url", "fileUrl", "location", "path", "Location"]) {
    if (typeof record[key] === "string") return record[key];
  }
  return extractFileUrl(record.data ?? record.result ?? null);
}

export async function GET(request: Request) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  try {
    const documents = await (await getTpaReportCollection()).find().sort({ uploadedAt: -1 }).limit(200).toArray();
    return NextResponse.json(documents.map(toTpaReport));
  } catch (error) {
    console.error("MongoDB TPA report read failed", error);
    return errorResponse("Could not load the TPA report history.", 503);
  }
}

export async function POST(request: Request) {
  const auth = await authorize(request, "add");
  if ("response" in auth) return auth.response;

  const form = await request.formData().catch(() => null);
  if (!form) return errorResponse("Send the report as multipart form data.");

  const tpaName = readString(form, "tpaName");
  const testedOn = readString(form, "testedOn");
  const serviceName = readString(form, "serviceName") as ReportTestApiKey;
  const environment = readString(form, "environment") as EnvironmentKey;
  const tpaIdValue = readString(form, "tpaId");
  const file = form.get("file");

  if (!tpaName) return errorResponse("Select a TPA.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testedOn)) return errorResponse("Select a valid test date.");
  if (!REPORT_TEST_APIS.some(({ key }) => key === serviceName)) return errorResponse("Select a testing API.");
  if (environment !== "uat" && environment !== "prod") return errorResponse("Select an environment.");
  if (!(file instanceof File) || !file.size) return errorResponse("Attach a file to upload.");
  if (file.size > MAX_FILE_BYTES) return errorResponse("The file must be 25 MB or smaller.");

  const upstreamForm = new FormData();
  upstreamForm.append("file", file, file.name);

  let response: Response;
  try {
    response = await fetch(uploadUrl(), { method: "POST", body: upstreamForm, cache: "no-store" });
  } catch (error) {
    console.error("Raha file upload request failed", error);
    return errorResponse("Could not reach the Raha upload service.", 503);
  }

  const rawBody = await response.text();
  const upstreamResponse = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return rawBody;
    }
  })();

  if (!response.ok) {
    const detail = typeof upstreamResponse === "object" && upstreamResponse !== null
      ? (upstreamResponse as Record<string, unknown>).message
      : upstreamResponse;
    return errorResponse(typeof detail === "string" && detail ? detail : `Upload failed with status ${response.status}.`, 502);
  }

  const document: TpaReportDocument = {
    tpaId: ObjectId.isValid(tpaIdValue) ? new ObjectId(tpaIdValue) : null,
    tpaName,
    serviceName,
    environment,
    testedOn,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "application/octet-stream",
    fileUrl: extractFileUrl(upstreamResponse),
    upstreamStatus: response.status,
    upstreamResponse,
    uploadedById: new ObjectId(auth.user.id),
    uploadedBy: auth.user.username,
    uploadedAt: new Date(),
  };

  try {
    const result = await (await getTpaReportCollection()).insertOne(document);
    return NextResponse.json(toTpaReport({ ...document, _id: result.insertedId }), { status: 201 });
  } catch (error) {
    console.error("MongoDB TPA report create failed", error);
    return errorResponse("The file uploaded but the report could not be saved.", 503);
  }
}
