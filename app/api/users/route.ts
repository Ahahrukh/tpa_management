import { NextResponse } from "next/server";
import { authorize, ensureDefaultUsers, toAuthUser } from "@/lib/auth";
import { getUserCollection } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(request, "admin");
  if ("response" in auth) return auth.response;
  await ensureDefaultUsers();
  const users = await (await getUserCollection()).find().sort({ role: 1, username: 1 }).toArray();
  return NextResponse.json({ users: users.map(toAuthUser) });
}
