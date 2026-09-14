"use strict";
/**
 * Every plan QRI offers, defined in one place.
 *
 * planCode is a plain string in the database, not an enum, so adding a
 * plan later needs no migration. The trade-off is that the database
 * won't catch a typo like "early_brid" on its own - so this list is the
 * thing that does. Anything writing a planCode validates against it
 * first, which gives the same safety an enum would, without the
 * migration cost.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CURRENT_PLAN_CODE = exports.PLANS = void 0;
exports.getPlan = getPlan;
exports.isValidPlanCode = isValidPlanCode;
exports.formatRupees = formatRupees;
exports.PLANS = {
    early_bird: {
        code: "early_bird",
        name: "Early Bird",
        amountPaise: 900,
        questionLimit: 150,
        durationDays: 30,
        razorpayPlanId: process.env.RAZORPAY_EARLY_BIRD_PLAN_ID,
    },
};
/** The plan new students are offered right now. */
exports.CURRENT_PLAN_CODE = "early_bird";
function getPlan(code) {
    return exports.PLANS[code] ?? null;
}
function isValidPlanCode(code) {
    return code in exports.PLANS;
}
/** Rupees, for display - derived so the two can never drift apart. */
function formatRupees(amountPaise) {
    return `Rs ${(amountPaise / 100).toFixed(0)}`;
}
//# sourceMappingURL=plans.js.map