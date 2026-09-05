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
   * can subscribe to it. Filled in once the account exists.
   */
  razorpayPlanId?: string;
}

export const PLANS: Record<string, Plan> = {
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
export const CURRENT_PLAN_CODE = "early_bird";

export function getPlan(code: string): Plan | null {
  return PLANS[code] ?? null;
}

export function isValidPlanCode(code: string): boolean {
  return code in PLANS;
}

/** Rupees, for display - derived so the two can never drift apart. */
export function formatRupees(amountPaise: number): string {
  return `Rs ${(amountPaise / 100).toFixed(0)}`;
}