import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin/session";
import {
  getBearerAccessToken,
  getSupabaseServerRequestClient,
  getVerifiedRequestUser,
} from "@/lib/supabase/server-request";

function clearCookie(response: NextResponse) {
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: Request) {
  const accessToken = getBearerAccessToken(request);
  const user = await getVerifiedRequestUser(accessToken);
  if (!user || !accessToken) {
    return clearCookie(NextResponse.json({ isAdmin: false }, { status: 401 }));
  }
  const supabase = getSupabaseServerRequestClient(accessToken);
  const { data, error } = await supabase.rpc("is_app_admin");
  if (error || data !== true) {
    return clearCookie(NextResponse.json({ isAdmin: false }));
  }
  const response = NextResponse.json({ isAdmin: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60,
  });
  return response;
}

export async function DELETE() {
  return clearCookie(NextResponse.json({ isAdmin: false }));
}
