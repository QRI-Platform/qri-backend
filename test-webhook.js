/**
 * Sends a webhook to our own endpoint with a correctly computed
 * signature, so the success path can be tested without ngrok.
 *
 * This isn't a substitute for a real Razorpay call - it uses our own
 * idea of the payload shape. What it does prove is that a valid
 * signature is accepted and that the handler activates the plan
 * correctly. The exact payload shape gets confirmed on deployment,
 * when a real webhook finally arrives.
 *
 * Run: node test-webhook.js <userId> <subscriptionId>
 */
require("dotenv").config();
const crypto = require("crypto");

const API = "http://localhost:4000";
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

async function main() {
  const userId = process.argv[2];
  const subscriptionId = process.argv[3];

  if (!userId || !subscriptionId) {
    console.error('Usage: node test-webhook.js <userId> <subscriptionId>');
    process.exit(1);
  }
  if (!SECRET) {
    console.error("RAZORPAY_WEBHOOK_SECRET isn't set in .env");
    process.exit(1);
  }

  const payload = {
    event: "subscription.charged",
    payload: {
      subscription: {
        entity: {
          id: subscriptionId,
          notes: { userId, planCode: "early_bird" },
        },
      },
      payment: {
        // Unique per run - razorpayPaymentId is @unique, so a fixed
        // value only works once. Real payments always have a fresh id.
        entity: { id: `pay_test${Date.now()}` },      },
    },
  };

  // Signed over the exact bytes we send - the same thing the server
  // will hash on the other side.
  const rawBody = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");

  console.log("Sending webhook...");
  const res = await fetch(`${API}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-razorpay-signature": signature,
    },
    body: rawBody,
  });

  console.log(`Status: ${res.status}`);
  console.log("Response:", JSON.stringify(await res.json(), null, 2));
}

main().catch((err) => console.error("Failed:", err));