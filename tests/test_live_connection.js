// =====================================================================
// Live Connection & Credentials Verification
// =====================================================================

const config = require("../src/config/env");
const nodemailer = require("nodemailer");

async function verifyLiveEnvironment() {
  console.log("=====================================================================");
  console.log("🔍 VERIFYING LIVE ENVIRONMENT & CREDENTIALS");
  console.log("=====================================================================\n");

  // 1. Check Gemini API
  console.log("1️⃣ Testing Google Gemini API...");
  if (!config.geminiApiKey || config.geminiApiKey === "your_gemini_api_key_here") {
    console.warn("⚠️ No valid GEMINI_API_KEY found in .env. Please set GEMINI_API_KEY.");
  } else {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
      const payload = {
        contents: [{ role: "user", parts: [{ text: "Respond with JSON: {\"status\": \"ok\", \"service\": \"gemini\"}" }] }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error(`❌ Gemini API Error (${res.status}): ${errorText}`);
      } else {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`✅ Google Gemini API connected successfully! (Model: ${config.geminiModel})`);
        console.log(`   Response: ${text.trim()}`);
      }
    } catch (err) {
      console.error(`❌ Gemini API connection failed: ${err.message}`);
    }
  }

  // 2. Check SMTP Configuration
  console.log("\n2️⃣ Testing SMTP Email Transport...");
  if (!config.smtp.user || !config.smtp.pass || config.smtp.user === "your_email@gmail.com") {
    console.warn("⚠️ SMTP credentials not fully configured. Email alerts will run in preview/simulation mode.");
  } else {
    try {
      const transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass
        },
        tls: { rejectUnauthorized: false }
      });

      await transporter.verify();
      console.log(`✅ SMTP server connected & authenticated successfully! (Host: ${config.smtp.host}:${config.smtp.port})`);
      console.log(`   Alert recipient: ${config.candidateEmail || "Not specified"}`);
    } catch (err) {
      console.error(`❌ SMTP verification failed: ${err.message}`);
      console.warn("💡 Tip: For Gmail, ensure you are using an App Password (not your normal account password).");
    }
  }

  console.log("\n=====================================================================");
  console.log("🏁 VERIFICATION COMPLETED");
  console.log("=====================================================================\n");
}

verifyLiveEnvironment();
