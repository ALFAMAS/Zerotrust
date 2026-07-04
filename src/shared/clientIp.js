"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIp = getClientIp;
/**
 * Read the live TCP remote address from the @hono/node-server context.
 *
 * This mirrors `@hono/node-server/conninfo`'s `getConnInfo`, but reads the node
 * socket off `c.env` directly: the `/conninfo` subpath export doesn't resolve
 * under Bun on Windows, and importing it would crash app startup. The server
 * exposes the node `IncomingMessage` on `c.env.incoming` (or `c.env.server.incoming`).
 */
function socketRemoteAddress(c) {
    const env = c.env;
    const bindings = env?.server ?? env;
    return bindings?.incoming?.socket?.remoteAddress;
}
/**
 * Resolve the client IP for a request.
 *
 * Header order matters: when the app sits behind a reverse proxy / CDN the real
 * client IP only lives in a forwarded header, so we prefer those. But in local
 * development (or behind a proxy that doesn't set them) none of those headers
 * exist — previously the IP was then logged as an empty string. We now fall back
 * to the actual TCP socket address via the node-server adapter so an IP is always
 * recorded.
 *
 * `x-forwarded-for` is a comma-separated chain (client, proxy1, proxy2…); the
 * left-most entry is the original client.
 */
function getClientIp(c) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first)
            return first;
    }
    const realIp = c.req.header("x-real-ip")?.trim();
    if (realIp)
        return realIp;
    const cfIp = c.req.header("cf-connecting-ip")?.trim();
    if (cfIp)
        return cfIp;
    // Fall back to the live connection's remote address (e.g. 127.0.0.1 locally).
    const address = socketRemoteAddress(c);
    if (address) {
        // Node reports IPv4-mapped IPv6 as "::ffff:1.2.3.4" — unwrap to the IPv4.
        return address.startsWith("::ffff:") ? address.slice(7) : address;
    }
    return "";
}
//# sourceMappingURL=clientIp.js.map