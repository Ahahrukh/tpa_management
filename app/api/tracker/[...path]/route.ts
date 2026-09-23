import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backendUrl = (path: string[]) => `${(process.env.RAHA_BACKEND_URL || "https://prodbackend.rahainsure.com").replace(/\/$/, "")}/api/v2/raha_user_master/tpa_tracker/${path.join("/")}`;

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const auth = await authorize(request);
  if ("response" in auth) return auth.response;
  const { path } = await context.params;
  const url = new URL(request.url);
  const upstream = new URL(backendUrl(path));
  upstream.search = url.search;
  const headers: HeadersInit = { "x-tpa-tracker-key": process.env.RAHA_TRACKER_API_KEY || "" };
  if (request.method !== "GET") headers["Content-Type"] = request.headers.get("content-type") || "application/json";
  const response = await fetch(upstream, { method: request.method, headers, body: request.method === "GET" ? undefined : await request.text(), cache: "no-store" });
  return new NextResponse(await response.arrayBuffer(), { status: response.status, headers: { "Content-Type": response.headers.get("content-type") || "application/json", "Content-Disposition": response.headers.get("content-disposition") || "" } });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) { return proxy(request, context); }
export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) { return proxy(request, context); }
