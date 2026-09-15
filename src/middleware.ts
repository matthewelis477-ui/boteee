import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Soft gate: require session cookie before rendering /admin HTML. Role checked in layout. */
export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/admin")) return NextResponse.next();
  const token = req.cookies.get("botee_token")?.value;
  if (!token) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", "/admin");
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
