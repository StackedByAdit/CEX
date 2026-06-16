export const SESSION_COOKIE_NAME = "orbit_token";

export function parseCookieHeader(header: string | undefined): Record<string, string> {
    if (!header) return {};

    return Object.fromEntries(
        header.split(";").map((part) => {
            const idx = part.indexOf("=");
            if (idx === -1) return [part.trim(), ""];

            const key = part.slice(0, idx).trim();
            const value = part.slice(idx + 1).trim();
            return [key, decodeURIComponent(value)];
        }),
    );
}

export function getSessionTokenFromRequest(req: {
    headers: { authorization?: string; cookie?: string };
}): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
        return authHeader.slice(7);
    }

    const cookies = parseCookieHeader(req.headers.cookie);
    return cookies[SESSION_COOKIE_NAME] ?? null;
}

export function sessionCookieOptions() {
    const secure = process.env.NODE_ENV === "production";

    return {
        httpOnly: true,
        secure,
        sameSite: "lax" as const,
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };
}

export function buildSetCookieHeader(name: string, value: string, options: ReturnType<typeof sessionCookieOptions>): string {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge !== undefined) {
        parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
    }
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

    return parts.join("; ");
}

export function buildClearCookieHeader(name: string, options: ReturnType<typeof sessionCookieOptions>): string {
    const parts = [`${name}=`, "Max-Age=0"];

    if (options.path) parts.push(`Path=${options.path}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

    return parts.join("; ");
}
