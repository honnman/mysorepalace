import { NextResponse, type NextRequest } from "next/server";

export const config = { matcher: ["/admin", "/admin/:path*"], runtime: "nodejs" };

function safeEqual(a: string, b: string): boolean {
  // Constant-time compare that also tolerates different lengths.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** HTTP Basic auth for /admin: any username, password = ADMIN_PASSWORD. */
export function middleware(req: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return new NextResponse("ADMIN_PASSWORD is not configured", { status: 503 });

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (safeEqual(supplied, password)) return NextResponse.next();
    } catch {
      // fall through to challenge
    }
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Heritage Desk admin", charset="UTF-8"' },
  });
}
