const fs = require("fs");
const path = require("path");

function setupDeploymentFiles() {
  const root = path.resolve(__dirname, "..");

  // 1. start_agent.bat
  const batPath = path.join(root, "start_agent.bat");
  const batContent = `@echo off
title AI Job Recommendation Agent (55m Runner)
cd /d "%~dp0"
echo ===================================================
echo Starting AI Job Recommendation Agent (India)
echo Running automatically every 55 minutes...
echo ===================================================
node src/index.js
pause
`;
  fs.writeFileSync(batPath, batContent, "utf8");

  // 2. start_agent_hidden.vbs (Runs silently in background without CMD window)
  const vbsPath = path.join(root, "start_agent_hidden.vbs");
  const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c node src/index.js >> logs/agent.log 2>&1", 0, False
Set WshShell = Nothing
`;
  fs.writeFileSync(vbsPath, vbsContent, "utf8");

  // 3. stop_agent.bat
  const stopBatPath = path.join(root, "stop_agent.bat");
  const stopBatContent = `@echo off
echo Stopping any running AI Job Agent instances...
taskkill /F /IM node.exe /FI "WINDOWTITLE eq AI Job Recommendation Agent*" 2>nul
echo Done.
`;
  fs.writeFileSync(stopBatPath, stopBatContent, "utf8");

  // 4. logs directory
  const logsDir = path.join(root, "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // 5. ecosystem.config.js for PM2
  const pm2Path = path.join(root, "ecosystem.config.js");
  const pm2Content = `module.exports = {
  apps: [
    {
      name: "ai-job-agent",
      script: "src/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production"
      },
      error_file: "logs/pm2-err.log",
      out_file: "logs/pm2-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
`;
  fs.writeFileSync(pm2Path, pm2Content, "utf8");

  // 6. Dockerfile
  const dockerPath = path.join(root, "Dockerfile");
  const dockerContent = `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
`;
  fs.writeFileSync(dockerPath, dockerContent, "utf8");

  // 7. GitHub Actions 24/7 Cloud Workflow
  const ghDir = path.join(root, ".github", "workflows");
  if (!fs.existsSync(ghDir)) {
    fs.mkdirSync(ghDir, { recursive: true });
  }
  const ghWorkflowPath = path.join(ghDir, "job_scanner.yml");
  const ghWorkflowContent = `name: 24/7 AI Job Recommendation Agent

on:
  schedule:
    - cron: '*/55 * * * *'
  workflow_dispatch:

jobs:
  scan-and-alert:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Execute Discovery, AI Scoring & Email Dispatch
        env:
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
          GEMINI_MODEL: gemini-3.6-flash
          CANDIDATE_NAME: "Vijayasimha"
          CANDIDATE_EMAIL: \${{ secrets.CANDIDATE_EMAIL }}
          SMTP_HOST: smtp.gmail.com
          SMTP_PORT: 465
          SMTP_SECURE: true
          SMTP_USER: \${{ secrets.SMTP_USER }}
          SMTP_PASS: \${{ secrets.SMTP_PASS }}
          SMTP_FROM: "Job Hunter AI <\${{ secrets.SMTP_USER }}>"
          ADZUNA_APP_ID: \${{ secrets.ADZUNA_APP_ID }}
          ADZUNA_APP_KEY: \${{ secrets.ADZUNA_APP_KEY }}
          RAPIDAPI_KEY: \${{ secrets.RAPIDAPI_KEY }}
          MIN_MATCH_SCORE_TO_EMAIL: 75
          MAX_JOB_AGE_HOURS: 24
          SCHEDULE_INTERVAL_MINUTES: 55
        run: node tests/test_live_single_run.js
`;
  fs.writeFileSync(ghWorkflowPath, ghWorkflowContent, "utf8");

  // 8. Windows User Startup Auto-run (Runs automatically on login)
  if (process.env.APPDATA) {
    try {
      const startupDir = path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
      if (fs.existsSync(startupDir)) {
        const startupBat = path.join(startupDir, "LaunchAIJobAgent.bat");
        const launcherScript = `@echo off\r\nwscript.exe "${vbsPath}"\r\n`;
        fs.writeFileSync(startupBat, launcherScript, "utf8");
        console.log(`✅ Configured Windows Startup Auto-launch: ${startupBat}`);
      }
    } catch(e) {
      console.warn("Startup folder configuration notice:", e.message);
    }
  }

  // 9. .gitignore (Protects credentials and dependencies from git)
  const gitignorePath = path.join(root, ".gitignore");
  const gitignoreContent = `node_modules/
.env
logs/
scratch/local_db.json
scratch/*.json
.pm2/
*.log
.DS_Store
`;
  fs.writeFileSync(gitignorePath, gitignoreContent, "utf8");
  console.log("✅ Created .gitignore file.");

  console.log("✅ All deployment and auto-start configurations completed successfully!");
}

setupDeploymentFiles();
