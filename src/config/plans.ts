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
 * The order plans appear on the pricing page. Kept here rather than in
 * the page so the catalogue stays the single source of truth.
 */
export const PLAN_ORDER = ["early_bird", "starter", "popular", "pro"];

/** Highlighted on the pricing page as the suggested choice. */
export const RECOMMENDED_PLAN_CODE = "popular";