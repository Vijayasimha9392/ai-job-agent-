# 🚀 Near-Real-Time Multi-Channel Deployment Guide

The **Job Hunter AI** operates in **near real-time** with multi-tier polling (2m fast tier, 5m normal tier, 2m batch aggregation window) delivering alerts across **Email (Nodemailer), Telegram Bot, and Push Notifications (Firebase FCM)**.

---

## ☁️ 1. Google Cloud Run Deployment (Continuous 24/7 Service)

Google Cloud Run runs the agent continuously with automated health monitoring and REST API webhooks.

### Step 1: Build & Deploy Container Image
```bash
# Authenticate with Google Cloud
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID

# Build and deploy to Cloud Run
gcloud run deploy job-hunter-ai \
  --source . \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --port 3000 \
  --min-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars "\
GEMINI_API_KEY=your_gemini_key,\
CANDIDATE_NAME=Vijayasimha Tammineni,\
ALERT_RECEIVER_EMAIL=thornay7@gmail.com,\
SMTP_USER=thornay7@gmail.com,\
SMTP_PASS=your_app_password,\
TELEGRAM_BOT_TOKEN=your_bot_token,\
TELEGRAM_CHAT_ID=your_chat_id,\
FIREBASE_PROJECT_ID=your_project_id,\
ENABLE_EMAIL_NOTIFICATIONS=true,\
ENABLE_TELEGRAM_NOTIFICATIONS=true,\
ENABLE_PUSH_NOTIFICATIONS=true"
```

---

## 📱 2. Telegram Bot Configuration

1. Open Telegram and search for `@BotFather`.
2. Send `/newbot` and follow prompts to get your `TELEGRAM_BOT_TOKEN`.
3. Start a chat with your new bot and get your Chat ID:
   - Search for `@userinfobot` or `@RawDataBot` on Telegram to get your numeric Chat ID.
4. Set in `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN="123456789:ABCdefGhIJKlmNoPQRstuvWxyz"
   TELEGRAM_CHAT_ID="987654321"
   ```

---

## 🔔 3. Firebase Cloud Messaging (Web Push & Mobile)

1. Open the [Firebase Console](https://console.firebase.google.com/) and create or select your project.
2. Go to **Project Settings -> Service Accounts -> Generate new private key**.
3. Download the JSON key and extract:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
4. Set these in `.env` or Cloud Run environment variables.
5. In your browser, navigate to `http://localhost:3000` (or your Cloud Run URL) and click **"🔔 Enable Web Push Alerts"**.

---

## 💻 4. Local Background Process (PM2 / Windows Service)

```bash
# Start background worker with auto-restart
npx pm2 start src/index.js --name "job-hunter-ai"

# View real-time logs
npx pm2 logs job-hunter-ai

# Check health
curl http://localhost:3000/health
```

---

## 🧪 5. Verification & Test Suite

Run the full 17-part automated integration suite:
```bash
npm test
```


