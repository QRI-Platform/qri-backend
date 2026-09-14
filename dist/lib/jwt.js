"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signToken = signToken;
exports.verifyToken = verifyToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
/** Create a signed token proving who this user is, valid for 7 days. */
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.AUTH_SECRET, { expiresIn: "7d" });
}
/** Verify a token's signature and expiry, and return its payload if valid. */
function verifyToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.env.AUTH_SECRET);
}
//# sourceMappingURL=jwt.js.map