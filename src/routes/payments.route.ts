import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../middleware/auth";
import { getRazorpay, isValidWebhookSignature } from "../lib/razorpay";
import { getPlan, CURRENT_PLAN_CODE } from "../config/plans";
import { env } from "../config/env";

export const paymentsRouter = Router();

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * POST /api/payments/subscribe
 *
 * Creates a Razorpay subscription and returns what the browser needs to
 * open their checkout. Deliberately NOT behind requireActivePlan - the
 * whole point is that the student doesn't have a plan yet.
 *
 * Nothing here marks the student as paid. That only happens when
 * Razorpay confirms the money actually moved, via the webhook below.
 * Trusting the browser to report its own successful payment would let
 * anyone grant themselves a subscription.
 */
paymentsRouter.post("/subscribe", requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const razorpay = getRazorpay();

  if (!razorpay) {
    return res.status(503).json({
      ok: false,
      error: { code: "PAYMENTS_UNAVAILABLE", message: "Payments aren't set up yet." },
    });
  }

  const plan = getPlan(CURRENT_PLAN_CODE);
  if (!plan?.razorpayPlanId) {
    console.error(`Plan "${CURRENT_PLAN_CODE}" has no razorpayPlanId configured`);
    return res.status(503).json({
      ok: false,
      error: { code: "PAYMENTS_UNAVAILABLE", message: "Payments aren't set up yet." },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planStatus: true, email: true, name: true },
  });

  if (user?.planStatus === "ACTIVE") {
    return res.status(400).json({
      ok: false,
      error: { code: "ALREADY_SUBSCRIBED", message: "You already have an active plan." },
    });
  }

  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: plan.razorpayPlanId,
      customer_notify: 1,
      /**
       * How many billing cycles before the subscription ends on its own.
       * 12 monthly cycles = a year, after which the student resubscribes.
       * Razorpay requires a finite number here.
       */
      total_count: 12,
      /**
       * Our own user id, echoed back on every webhook. This is how a
       * payment event gets matched to a student - the webhook arrives
       * from Razorpay's servers with no session attached.
       */
      notes: { userId, planCode: plan.code },
    });

    await prisma.subscription.create({
      data: {
        userId,
        planCode: plan.code,
        amountPaise: plan.amountPaise,
        razorpaySubscriptionId: subscription.id,
        status: "CREATED",
      },
    });

    res.status(201).json({
      ok: true,
      data: {
        subscriptionId: subscription.id,
        // Publishable key - safe to send to the browser. The secret never leaves the server.
        keyId: env.RAZORPAY_KEY_ID,
        planName: plan.name,
        amountPaise: plan.amountPaise,
      },
    });
  } catch (err) {
    console.error("Razorpay subscription creation failed:", err);
    res.status(502).json({
      ok: false,
      error: { code: "PAYMENT_FAILED", message: "Couldn't start the payment. Please try again." },
    });
  }
});

interface RazorpayWebhookEvent {
  event?: string;
  payload?: {
    subscription?: {
      entity?: {
        id?: string;
        notes?: { userId?: string; planCode?: string };
      };
    };
    payment?: {
      entity?: { id?: string };
    };
  };
}

/**
 * POST /api/payments/webhook
 *
 * Razorpay calls this when something happens to a subscription. No
 * requireAuth - the caller is Razorpay's server, not a browser. The
 * signature check IS the authentication.
 *
 * Always returns 200 once the signature is valid, even if we couldn't
 * act on the event. Razorpay retries anything non-2xx, and retrying
 * won't fix an event we don't recognise - it would just repeat forever.
 */
paymentsRouter.post("/webhook", async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = (req as typeof req & { rawBody?: Buffer }).rawBody;

  if (typeof signature !== "string" || !rawBody) {
    return res.status(400).json({ ok: false, error: { code: "BAD_REQUEST", message: "Invalid" } });
  }

  if (!isValidWebhookSignature(rawBody, signature)) {
    console.error("Rejected a webhook with an invalid signature");
    return res.status(401).json({ ok: false, error: { code: "INVALID_SIGNATURE", message: "Invalid" } });
  }

  const event = req.body as RazorpayWebhookEvent;
  const eventType = event.event ?? "";
  const subscriptionEntity = event.payload?.subscription?.entity;
  const subscriptionId = subscriptionEntity?.id;
  const userId = subscriptionEntity?.notes?.userId;
  const paymentId = event.payload?.payment?.entity?.id;

  console.log(`Razorpay webhook: ${eventType}, subscription=${subscriptionId}, user=${userId}`);

  if (!subscriptionId || !userId) {
    // Nothing actionable, but the signature was valid - don't make
    // Razorpay retry.
    return res.json({ ok: true, data: { handled: false } });
  }

  try {
    /**
     * subscription.charged fires both for the first payment and for
     * every renewal, so this one handler covers both. It's also the
     * point at which the question allowance resets - a new billing
     * period has genuinely begun.
     */
    if (eventType === "subscription.charged") {
      const planCode = subscriptionEntity?.notes?.planCode ?? CURRENT_PLAN_CODE;
      const plan = getPlan(planCode);
      if (!plan) {
        console.error(`Webhook referenced unknown plan "${planCode}"`);
        return res.json({ ok: true, data: { handled: false } });
      }

      const now = new Date();

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            planStatus: "ACTIVE",
            planCode: plan.code,
            planExpiresAt: addDays(now, plan.durationDays),
            questionsUsed: 0,
            usagePeriodStart: now,
          },
        }),
        prisma.subscription.updateMany({
          where: { razorpaySubscriptionId: subscriptionId },
          data: {
            status: "ACTIVE",
            razorpayPaymentId: paymentId,
            currentPeriodStart: now,
            currentPeriodEnd: addDays(now, plan.durationDays),
          },
        }),
      ]);

      return res.json({ ok: true, data: { handled: true } });
    }

    if (eventType === "subscription.cancelled" || eventType === "subscription.halted") {
      /**
       * The plan is deliberately NOT ended immediately. The student has
       * paid for the current period, so they keep it until
       * planExpiresAt, which requireActivePlan already enforces.
       */
      await prisma.$transaction([
        prisma.subscription.updateMany({
          where: { razorpaySubscriptionId: subscriptionId },
          data: { status: "CANCELLED" },
        }),
      ]);

      return res.json({ ok: true, data: { handled: true } });
    }

    return res.json({ ok: true, data: { handled: false } });
  } catch (err) {
    console.error("Webhook handling failed:", err);
    // A 500 here makes Razorpay retry, which is what we want if our own
    // database was momentarily unavailable.
    return res.status(500).json({
      ok: false,
      error: { code: "INTERNAL", message: "Something went wrong" },
    });
  }
});