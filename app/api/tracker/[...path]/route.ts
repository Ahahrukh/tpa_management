import { NextResponse } from "next/server";
import { ObjectId, type Document } from "mongodb";
import { authorize } from "@/lib/auth";
import { getSecondaryDatabase } from "@/lib/secondary-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

const backendUrl = (path: string[]) => `${(process.env.RAHA_BACKEND_URL || "https://prodbackend.rahainsure.com").replace(/\/$/, "")}/api/v2/raha_user_master/tpa_tracker/${path.join("/")}`;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message, message }, { status });
}

function asObjectId(value: string | null) {
  return value && ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function csvCell(value: unknown) {
  let text = value === null || value === undefined
    ? ""
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function claimsCsv(documents: Document[]) {
  const rows = documents.flatMap((document) => {
    const base: Record<string, unknown> = {
      tpa_name: document.tpa_name,
      policy_number: document.policy_number,
      employee_code: document.employee_code,
      user_role: document.user_role,
      created_at: document.createdAt,
      updated_at: document.updatedAt,
    };
    const data = Array.isArray(document.data) ? document.data : [];
    return data.length ? data.map((claim) => ({ ...base, ...(claim && typeof claim === "object" ? claim : { claim }) })) : [base];
  });
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [headers, ...rows.map((row) => headers.map((header) => row[header]))]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

async function proxy(request: Request, path: string[]) {
  const url = new URL(request.url);
  const upstream = new URL(backendUrl(path));
  upstream.search = url.search;
  const headers: HeadersInit = { "x-tpa-tracker-key": process.env.RAHA_TRACKER_API_KEY || "" };
  if (request.method !== "GET") headers["Content-Type"] = request.headers.get("content-type") || "application/json";
  const response = await fetch(upstream, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : await request.text(),
    cache: "no-store",
  });
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json",
      "Content-Disposition": response.headers.get("content-disposition") || "",
    },
  });
}

async function getCompanies() {
  const database = await getSecondaryDatabase();
  const companies = await database.collection("raha_company_master")
    .find({ company_name: { $type: "string", $ne: "" } }, { projection: { company_name: 1, isActive: 1, user_status: 1 } })
    .sort({ company_name: 1 })
    .toArray();
  return NextResponse.json({
    data: companies.map((company) => ({
      _id: company._id.toHexString(),
      company_name: company.company_name,
      isActive: company.isActive,
      user_status: company.user_status,
    })),
  });
}

async function getCompanyContacts(companyIdValue: string) {
  const companyId = asObjectId(companyIdValue);
  if (!companyId) return errorResponse("Invalid company id.");
  const database = await getSecondaryDatabase();
  const contacts = await database.collection("raha_client_master")
    .find(
      { raha_company_id: companyId },
      { projection: { employee_name: 1, designation: 1, department: 1, location: 1, status: 1, isActive: 1 } },
    )
    .sort({ employee_name: 1 })
    .toArray();
  return NextResponse.json({ data: contacts.map((contact) => ({ ...contact, _id: contact._id.toHexString() })) });
}

async function getPolicies(companyIdValue: string, url: URL) {
  const companyId = asObjectId(companyIdValue);
  if (!companyId) return errorResponse("Invalid company id.");
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 300, 1), 500);
  const database = await getSecondaryDatabase();
  const filter: Document = { raha_company_id: companyId, active_status: /^active$/i };
  if (query) {
    const pattern = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ policy_number: pattern }, { policy_type: pattern }, { "insurer_details.tpa_name": pattern }];
  }
  const policies = await database.collection("raha_policy_master")
    .aggregate([
      { $match: filter },
      {
        $addFields: {
          normalized_policy_number: {
            $toUpper: {
              $trim: {
                input: { $convert: { input: "$policy_number", to: "string", onError: "", onNull: "" } },
              },
            },
          },
        },
      },
      { $match: { normalized_policy_number: { $ne: "" } } },
      { $sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
      { $group: { _id: "$normalized_policy_number", policy: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$policy" } },
      { $sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
      { $limit: limit },
      { $project: { policy_number: 1, policy_type: 1, policy_status: 1, active_status: 1, insurer_details: 1 } },
    ])
    .toArray();
  return NextResponse.json({
    data: policies.map((policy) => ({ ...policy, _id: policy._id.toHexString(), raha_company_id: companyId.toHexString() })),
    meta: { limit, search: query },
  });
}

async function getEmployees(url: URL) {
  const companyId = asObjectId(url.searchParams.get("company_id"));
  if (!companyId) return errorResponse("A valid company_id is required.");
  const model = url.searchParams.get("model") === "pre_enrollment" ? "pre_enrollment" : "onboarding";
  const query = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);
  const database = await getSecondaryDatabase();
  const collectionName = model === "pre_enrollment" ? "raha_temp_employee_master" : "raha_employee_master";
  const companyField = model === "pre_enrollment" ? "rfq_mongo_id" : "client_id";
  const filter: Document = { [companyField]: companyId };
  if (query) {
    const pattern = new RegExp(escapeRegex(query), "i");
    filter.$or = [{ user_first_name: pattern }, { user_last_name: pattern }, { user_emp_id: pattern }, { user_email_id: pattern }];
  }
  const employees = await database.collection(collectionName)
    .find(filter, { projection: { user_first_name: 1, user_last_name: 1, user_emp_id: 1, user_dob: 1, user_email_id: 1, user_phone_number: 1, isActive: 1 } })
    .sort({ user_first_name: 1, user_emp_id: 1 })
    .limit(limit)
    .toArray();
  return NextResponse.json({
    data: employees.map((employee) => ({ ...employee, _id: employee._id.toHexString() })),
    meta: { limit, model, search: query },
  });
}

async function getClaimsReport(request: Request, path: string[]) {
  const url = new URL(request.url);
  if (url.searchParams.get("source") === "tpa") return proxy(request, path);
  const companyId = asObjectId(url.searchParams.get("company_id"));
  const policyId = asObjectId(url.searchParams.get("policy_id"));
  if (!companyId || !policyId) return errorResponse("Valid company_id and policy_id values are required.");
  const database = await getSecondaryDatabase();
  const policy = await database.collection("raha_policy_master").findOne(
    { _id: policyId, raha_company_id: companyId },
    { projection: { policy_number: 1 } },
  );
  if (!policy) return errorResponse("Policy was not found for this company.", 404);
  const policyNumber = String(policy.policy_number ?? "").trim();
  const claims = await database.collection("raha_tpa_claim_master")
    .find({ raha_company_id: companyId, policy_number: { $regex: `^${escapeRegex(policyNumber)}$`, $options: "i" } })
    .sort({ createdAt: -1 })
    .toArray();
  const csv = claimsCsv(claims);
  const safePolicyNumber = (policyNumber || "claims").replace(/[^a-z0-9_-]+/gi, "-");
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="claims-${safePolicyNumber}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

async function updateEmployee(request: Request, employeeIdValue: string, actor: { id: string; username: string }) {
  const employeeId = asObjectId(employeeIdValue);
  if (!employeeId) return errorResponse("Invalid employee id.");
  const payload = await request.json() as Record<string, unknown>;
  if (payload.confirmed !== true) return errorResponse("Employee changes must be confirmed.");
  const companyId = asObjectId(typeof payload.company_id === "string" ? payload.company_id : null);
  if (!companyId) return errorResponse("A valid company_id is required.");
  const model = payload.model === "pre_enrollment" ? "pre_enrollment" : "onboarding";
  const fields: Record<string, string> = {
    employee_code: "user_emp_id",
    name: "user_first_name",
    dob: "user_dob",
    email: "user_email_id",
    mobile: "user_phone_number",
  };
  const requestedField = typeof payload.field === "string" ? payload.field : "";
  const databaseField = fields[requestedField];
  const value = typeof payload.value === "string" ? payload.value.trim() : "";
  if (!databaseField || !value) return errorResponse("A supported field and non-empty value are required.");
  const collectionName = model === "pre_enrollment" ? "raha_temp_employee_master" : "raha_employee_master";
  const companyField = model === "pre_enrollment" ? "rfq_mongo_id" : "client_id";
  const database = await getSecondaryDatabase();
  const collection = database.collection(collectionName);
  const employee = await collection.findOne({ _id: employeeId, [companyField]: companyId });
  if (!employee) return errorResponse("Employee was not found for this company.", 404);
  const updatedAt = new Date();
  const session = database.client.startSession();
  let matchedCount = 0;
  try {
    await session.withTransaction(async () => {
      const result = await collection.updateOne(
        { _id: employeeId, [companyField]: companyId },
        { $set: { [databaseField]: value, updatedAt, updated_by: new ObjectId(actor.id) } },
        { session },
      );
      matchedCount = result.matchedCount;
      if (!matchedCount) throw new Error("Employee no longer exists for this company.");
      await database.collection("tpa_tracker_audit_logs").insertOne({
        action: "employee_update",
        collection: collectionName,
        employee_id: employeeId,
        company_id: companyId,
        field: databaseField,
        previous_value: employee[databaseField] ?? null,
        new_value: value,
        actor_id: new ObjectId(actor.id),
        actor_username: actor.username,
        occurred_at: updatedAt,
      }, { session });
    });
  } finally {
    await session.endSession();
  }
  if (!matchedCount) return errorResponse("Employee update failed.", 409);
  return NextResponse.json({ message: "Employee updated successfully.", data: { _id: employeeId.toHexString(), [databaseField]: value } });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const { path } = await context.params;
  try {
    if (path.length === 1 && path[0] === "clients") return getCompanies();
    if (path.length === 3 && path[0] === "clients" && path[2] === "policies") return getPolicies(path[1], new URL(request.url));
    if (path.length === 3 && path[0] === "clients" && path[2] === "contacts") return getCompanyContacts(path[1]);
    if (path.length === 1 && path[0] === "employees") return getEmployees(new URL(request.url));
    if (path.length === 1 && path[0] === "claims_report") return getClaimsReport(request, path);
    return errorResponse("Tracker route was not found.", 404);
  } catch (error) {
    console.error("Secondary tracker database request failed", error);
    return errorResponse("Could not read the secondary Raha database.", 503);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorize(request, "edit");
  if ("response" in auth) return auth.response;
  const { path } = await context.params;
  try {
    if (path.length === 2 && path[0] === "employees") return updateEmployee(request, path[1], auth.user);
    return errorResponse("Tracker route was not found.", 404);
  } catch (error) {
    console.error("Secondary tracker database update failed", error);
    return errorResponse("Could not update the secondary Raha database.", 503);
  }
}
