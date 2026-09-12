import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ObjectId } from "mongodb";
import { getUserCollection, type UserDocument } from "./db";
import type { AuthUser, UserPermissions } from "./types";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "tpa_session";
const SESSION_LENGTH_SECONDS = 60 * 60 * 12;
const noPermissions: UserPermissions = { add: false, edit: false, delete: false, export: false };
const allPermissions: UserPermissions = { add: true, edit: true, delete: true, export: true };

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return secret;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function ensureDefaultUsers() {
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const viewerPassword = process.env.INITIAL_VIEWER_PASSWORD;
  if (!adminPassword || !viewerPassword) throw new Error("Initial login passwords are not configured.");
  const users = await getUserCollection();
  const now = new Date();
  const seeds = [
    { username: "Admin", normalizedUsername: "admin", password: adminPassword, role: "admin" as const, permissions: allPermissions },
    { username: "Aravind_Raha", normalizedUsername: "aravind_raha", password: viewerPassword, role: "viewer" as const, permissions: noPermissions },
  ];
  for (const seed of seeds) {
    const exists = await users.findOne({ normalizedUsername: seed.normalizedUsername }, { projection: { _id: 1 } });
    if (!exists) {
      await users.updateOne(
        { normalizedUsername: seed.normalizedUsername },
        { $setOnInsert: { username: seed.username, normalizedUsername: seed.normalizedUsername, passwordHash: await hashPassword(seed.password), role: seed.role, permissions: seed.permissions, createdAt: now, updatedAt: now } },
        { upsert: true },
      );
    }
  }
}

export function createSessionToken(userId: string) {
  const payload = Buffer.from(JSON.stringify({ userId, exp: Math.floor(Date.now() / 1000) + SESSION_LENGTH_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function verifySessionToken(token?: string) {
  if (!token) return null;
  const [payload, receivedSignature] = token.split(".");
  if (!payload || !receivedSignature) return null;
  const expectedSignature = createHmac("sha256", authSecret()).update(payload).digest("base64url");
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId: string; exp: number };
    if (!ObjectId.isValid(data.userId) || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.userId;
  } catch {
    return null;
  }
}

export function toAuthUser(user: UserDocument & { _id: ObjectId }): AuthUser {
  return { id: user._id.toHexString(), username: user.username, role: user.role, permissions: user.role === "admin" ? allPermissions : user.permissions };
}

export async function getAuthenticatedUser(request: Request) {
  const userId = verifySessionToken(readCookie(request, SESSION_COOKIE));
  if (!userId) return null;
  const user = await (await getUserCollection()).findOne({ _id: new ObjectId(userId) });
  return user ? toAuthUser(user) : null;
}

export async function authorize(request: Request, permission?: keyof UserPermissions | "admin") {
  const user = await getAuthenticatedUser(request);
  if (!user) return { response: Response.json({ error: "Authentication required." }, { status: 401 }) };
  if (permission === "admin" && user.role !== "admin") return { response: Response.json({ error: "Administrator access required." }, { status: 403 }) };
  if (permission && permission !== "admin" && user.role !== "admin" && !user.permissions[permission]) return { response: Response.json({ error: "You do not have permission for this action." }, { status: 403 }) };
  return { user };
}
