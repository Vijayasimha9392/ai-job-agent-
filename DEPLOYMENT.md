# 🚀 Production Deployment & Automation Guide

The **AI Job Recommendation Agent** is configured to run fully autonomously every **55 minutes** with multiple deployment options depending on your preference.

---

## 💻 1. Local Auto-Deployment (Windows Background Runner) — **ACTIVE NOW**

Your agent is now configured to start automatically in the background every time Windows boots or when you log in:

- **Startup Auto-Launch Location**: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LaunchAIJobAgent.bat`
- **Silent Background Launcher**: [`start_agent_hidden.vbs`](file:///C:/Users/vijay/.gemini/antigravity/scratch/ai-job-agent/start_agent_hidden.vbs) (Runs Node.js without opening any command prompt window)
- **Live Output Logs**: [`logs/agent.log`](file:///C:/Users/vijay/.gemini/antigravity/scratch/ai-job-agent/logs/agent.log)
- **Manual Launch with Terminal**: Double-click [`start_agent.bat`](file:///C:/Users/vijay/.gemini/antigravity/scratch/ai-job-agent/start_agent.bat)
- **Stop Agent**: Double-click [`stop_agent.bat`](file:///C:/Users/vijay/.gemini/antigravity/scratch/ai-job-agent/stop_agent.bat)

---

## ⚡ 2. PM2 Process Manager (Local / VPS)

For enterprise-grade auto-restart, log rotation, and memory management:

```bash
# Start agent in background with auto-restart on crashes
npx pm2 start ecosystem.config.js

# View real-time logs
npx pm2 logs ai-job-agent

# Check process status
npx pm2 status

# Stop agent
npx pm2 stop ai-job-agent
```

---

## ☁️ 3. Free 24/7 Cloud Automation (GitHub Actions)

If you want the agent to scan every 55 minutes **even when your laptop is turned off**, push this project to a private GitHub repository:

1. Create a repository on GitHub (private recommended) and push the code:
   ```bash
   git init
   git add .
   git commit -m "feat: initial ai job recommendation agent"
   git remote add origin https://github.com/yourusername/ai-job-agent.git
   git push -u origin main
   ```
2. In GitHub, navigate to **Settings -> Secrets and variables -> Actions** and add the following repository secrets:
   - `GEMINI_API_KEY`
   - `CANDIDATE_EMAIL`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `ADZUNA_APP_ID`
   - `ADZUNA_APP_KEY`
   - `RAPIDAPI_KEY`
3. GitHub Actions will automatically run [`job_scanner.yml`](file:///C:/Users/vijay/.gemini/antigravity/scratch/ai-job-agent/.github/workflows/job_scanner.yml) every **55 minutes** 24/7 on free GitHub runners.

---

## 🐳 4. Docker / Cloud Server Deployment (Render, Railway, Fly.io, DigitalOcean)

Build and run the standalone container anywhere:

```bash
# Build Docker image
docker build -t ai-job-agent .

# Run container in background
docker run -d --name ai-job-agent --restart always --env-file .env ai-job-agent

# View container logs
docker logs -f ai-job-agent
```

---

## 🔄 5. n8n Visual Workflow Engine

To use the visual orchestrator:

1. Navigate to the `n8n` directory:
   ```bash
   cd n8n
   docker compose up -d
   ```
2. Open `http://localhost:5678` in your browser.
3. Import [`n8n/job_agent_workflow.json`](file:///C:/Users/vijay/.gemini/antigravity/scratch/ai-job-agent/n8n/job_agent_workflow.json).
4. Click **Activate Workflow**. It will trigger every 55 minutes.

