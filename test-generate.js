/**
 * Calls the AI developer's question generator directly and reports both
 * the response shape and how long it takes.
 *
 * Run before building anything against it. In Phase 1 the written spec
 * had drifted from their working code (it said "file" where the server
 * wanted "files"), and that cost a full round of debugging.
 *
 * Run: node test-generate.js
 */
require("dotenv").config();

const AI_URL = process.env.AI_SERVICE_URL;

async function main() {
  if (!AI_URL) {
    console.error("AI_SERVICE_URL isn't set in .env");
    process.exit(1);
  }

  const body = {
    subject: "physics",
    difficulty: "very easy",
    num_questions: 10,
  };

  console.log("POST", `${AI_URL}/api/v1/graph/generate-test`);
  console.log("Body:", JSON.stringify(body));
  console.log("");

  const startedAt = Date.now();

  try {
    const res = await fetch(`${AI_URL}/api/v1/graph/generate-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const elapsed = Date.now() - startedAt;
    console.log(`Status: ${res.status}`);
    console.log(`Time:   ${elapsed}ms  (${(elapsed / 1000).toFixed(1)}s)`);
    console.log("");

    const text = await res.text();

    try {
      const parsed = JSON.parse(text);
      console.log("Response:");
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      // Not JSON - print it raw so the actual shape is visible.
      console.log("Raw response (not JSON):");
      console.log(text.slice(0, 3000));
    }
  } catch (err) {
    console.error(`Failed after ${Date.now() - startedAt}ms:`, err);
  }
}

main();