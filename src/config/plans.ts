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

export interface Plan {
  code: string;
  name: string;
  /** Whole paise, never rupees as a decimal. Rs 9 = 900. */
  amountPaise: number;
  /** Questions a student can ask per billing period. */
  questionLimit: number;
  /** Length of one billing period, in days. */
  durationDays: number;
  /**
   * Razorpay's own plan id, created by hand in their dashboard - their
   * Subscriptions API needs a plan to exist on their side before anyone
   * can subscribe to it.
   */
  razorpayPlanId?: string;
  /**
   * A free allowance given once, not a subscription.
   *
   * Two things follow from this: the usage period never rolls over (a
   * trial that reset monthly would be free forever), and a student on
   * one is allowed to subscribe - unlike a paying subscriber, who would
   * otherwise end up with two subscriptions.
   */
  isTrial?: boolean;
}

export const PLANS: Record<string, Plan> = {
  /**
   * Given automatically at signup. No payment, no expiry date - just
   * fifty questions. A student who comes back six months later still
   * has whatever they didn't use.
   */
  free_trial: {
    code: "free_trial",
    name: "Free trial",
    amountPaise: 0,
    questionLimit: 30,
    // Not meaningful for a trial, but the field is required. The
    // isTrial flag stops anything from acting on it.
    durationDays: 3650,
    isTrial: true,
  },

  /**
   * Retired. Kept in the catalogue because the founder and one test
   * account paid for it with real money - removing it would leave
   * their planCode pointing at a plan that doesn't exist, and every
   * request they make would fail. Absent from PLAN_ORDER, so it no
   * longer appears on the pricing page.
   */
  early_bird: {
    code: "early_bird",
    name: "Early Bird",
    amountPaise: 900, // Rs 9
    questionLimit: 150,
    durationDays: 30,
    razorpayPlanId: process.env.RAZORPAY_EARLY_BIRD_PLAN_ID,
  },

  starter: {
    code: "starter",
    name: "Starter",
    amountPaise: 9900, // Rs 99
    questionLimit: 500,
    durationDays: 30,
    razorpayPlanId: process.env.RAZORPAY_STARTER_PLAN_ID,
  },
  popular: {
    code: "popular",
    name: "Popular",
    amountPaise: 14900, // Rs 149
    questionLimit: 1000,
    durationDays: 30,
    razorpayPlanId: process.env.RAZORPAY_POPULAR_PLAN_ID,
  },
  pro: {
    code: "pro",
    name: "Pro",
    amountPaise: 19900, // Rs 199
    questionLimit: 1400,
    durationDays: 30,
    razorpayPlanId: process.env.RAZORPAY_PRO_PLAN_ID,
  },
};

/**
 * The plans shown on the pricing page, in order.
 *
 * free_trial isn't here - nobody chooses it, it's simply given at
 * signup. Nor is early_bird, which is retired.
 */
export const PLAN_ORDER = ["starter", "popular", "pro"];

/** Highlighted on the pricing page as the suggested choice. */
export const RECOMMENDED_PLAN_CODE = "popular";

/** Given to every new account. */
export const TRIAL_PLAN_CODE = "free_trial";

/**
 * Fallback only. Used by the webhook when a subscription's notes don't
 * carry a planCode - which shouldn't happen, but would for anything
 * created before plan selection existed.
 */
export const CURRENT_PLAN_CODE = "starter";

export function getPlan(code: string): Plan | null {
  return PLANS[code] ?? null;
}

export function isValidPlanCode(code: string): boolean {
  return code in PLANS;
}

/**
 * Whether a plan can be subscribed to. Guards against someone posting
 * "free_trial" or "early_bird" to the subscribe endpoint to get a plan
 * that isn't on sale.
 */
export function isPurchasablePlan(code: string): boolean {
  return PLAN_ORDER.includes(code);
}

/** Rupees, for display - derived so the two can never drift apart. */
export function formatRupees(amountPaise: number): string {
  return `₹${(amountPaise / 100).toFixed(0)}`;
}