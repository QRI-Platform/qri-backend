"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const SALT_ROUNDS = 10;
/** Turn a plain-text password into a one-way hash for storage. */
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, SALT_ROUNDS);
}
/** Compare a plain-text password attempt against the stored hash. */
async function verifyPassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
//# sourceMappingURL=password.js.map