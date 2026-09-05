/**
 * Quick manual test for the upload endpoint.
 * Windows PowerShell 5.1 has no -Form support, so this does it instead.
 *
 * Run: node test-upload.js "B:/path/to/your/file.pdf"
 */
const fs = require("fs");
const path = require("path");

const API = "http://localhost:4000";
const EMAIL = "test@qri.com";
const PASSWORD = "password123";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node test-upload.js "B:/path/to/file.pdf"');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
  }

  console.log("Logging in...");
  const loginRes = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const login = await loginRes.json();
  if (!login.ok) return console.error("Login failed:", login.error);
  const token = login.data.token;

  console.log("Fetching chats...");
  const chatsRes = await fetch(`${API}/api/chats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const chats = await chatsRes.json();
  if (!chats.ok) return console.error("Could not list chats:", chats.error);
  const chatId = chats.data.chats[0]?.id;
  if (!chatId) return console.error("No chats exist - create one in the app first.");
  console.log("Using chat:", chatId);

  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  console.log(`Uploading ${fileName} (${(buffer.length / 1024).toFixed(0)} KB)...`);

  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(buffer)]), fileName);

  const startedAt = Date.now();
  const uploadRes = await fetch(`${API}/api/chats/${chatId}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  console.log(`Status: ${uploadRes.status} (${Date.now() - startedAt}ms)`);
  console.log("Response:", JSON.stringify(await uploadRes.json(), null, 2));
}

main().catch((err) => console.error("Failed:", err));