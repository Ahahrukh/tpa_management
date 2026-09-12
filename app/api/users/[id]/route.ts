import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { authorize, toAuthUser } from "@/lib/auth";
import { getUserCollection } from "@/lib/db";
import type { UserPermissions } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };
const permissionKeys: (keyof UserPermissions)[] = ["add", "edit", "delete", "export"];

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authorize(request, "admin");
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  const payload = (await request.json()) as { permissions?: Partial<UserPermissions> };
  const updates: Partial<UserPermissions> = {};
  for (const key of permissionKeys) if (typeof payload.permissions?.[key] === "boolean") updates[key] = payload.permissions[key];
  if (!Object.keys(updates).length) return NextResponse.json({ error: "No valid permissions supplied." }, { status: 400 });

  const users = await getUserCollection();
  const target = await users.findOne({ _id: new ObjectId(id) });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (target.role === "admin") return NextResponse.json({ error: "Administrator permissions cannot be restricted." }, { status: 400 });
  const permissions = { ...target.permissions, ...updates };
  const updated = await users.findOneAndUpdate({ _id: target._id }, { $set: { permissions, updatedAt: new Date() } }, { returnDocument: "after" });
  return NextResponse.json({ user: toAuthUser(updated!) });
}
