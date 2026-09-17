import { NextResponse } from "next/server";
import { createSessionToken, ensureDefaultUsers, SESSION_COOKIE, SESSION_LENGTH_SECONDS, toAuthUser, verifyPassword } from "@/lib/auth";
import { getUserCollection } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) return NextResponse.json({ error: "Username and password are required." }, { status: 400 });

  try {
    await ensureDefaultUsers();
    const user = await (await getUserCollection()).findOne({ normalizedUsername: username.toLowerCase() });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }
    const response = NextResponse.json({ user: toAuthUser(user) });
    response.cookies.set(SESSION_COOKIE, createSessionToken(user._id.toHexString()), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_LENGTH_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Login service is unavailable." }, { status: 503 });
  }
}
