"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jwt_1 = require("../lib/jwt");
/**
 * Checks for a valid Bearer token on the request. If valid, attaches the
 * decoded payload to req.user so later handlers know who's asking.
 *
 * Not used by any route yet - register/login/oauth-sync are public
 * (anyone can hit them without already being logged in). This exists
 * ready for Day 4+, when we protect /api/chat, /api/profile, etc.
 */
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        return res.status(401).json({
            ok: false,
            error: { code: "UNAUTHORIZED", message: "Missing bearer token" },
        });
    }
    try {
        req.user = (0, jwt_1.verifyToken)(header.slice(7));
        next();
    }
    catch {
        return res.status(401).json({
            ok: false,
            error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" },
        });
    }
}
//# sourceMappingURL=auth.js.map