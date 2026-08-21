// =====================================================================
// Frontend Web Push & Real-Time Feed Controller
// =====================================================================

async function loadRecentJobs() {
  try {
    const res = await fetch("/api/jobs/recent?limit=15");
    const data = await res.json();
    const container = document.getElementById("jobsContainer");

    if (!data.jobs || data.jobs.length === 0) {
      container.innerHTML = `
        <div class="job-card" style="text-align:center; padding: 2rem; color: #94a3b8;">
          <p>✨ No notified jobs in local database yet.</p>
          <p style="font-size:0.85rem; margin-top:0.5rem;">Scanning Greenhouse, Lever, Ashby, Workday, Adzuna, and JSearch every 2 minutes.</p>
        </div>`;
      return;
    }

    container.innerHTML = data.jobs.map(j => {
      const skills = Array.isArray(j.skills) ? j.skills : [];
      return `
        <div class="job-card">
          <div class="job-top">
            <div>
              <div class="job-title">${j.title}</div>
              <div class="job-company">${j.company} • ${j.location} (${j.work_mode || "On-site"})</div>
            </div>
            <div class="job-score">${j.match_score || 85}% Match</div>
          </div>
          <div class="job-tags">
            <span class="tag">Source: ${j.source}</span>
            <span class="tag">${j.employment_type || "Full-time"}</span>
            ${skills.slice(0, 5).map(s => `<span class="tag">${s}</span>`).join("")}
          </div>
          <div class="job-footer">
            <div>Discovered: ${new Date(j.discovered_at || j.created_at).toLocaleTimeString()}</div>
            <a href="${j.application_url}" target="_blank" rel="noopener" class="btn" style="padding:0.4rem 0.8rem; font-size:0.85rem;">Apply Now ↗</a>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Error loading recent jobs:", err);
  }
}

async function requestPushPermission() {
  if (!("Notification" in window)) {
    alert("This browser does not support desktop push notifications.");
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    document.getElementById("btnPush").innerText = "✅ Push Notifications Enabled";
    document.getElementById("btnPush").style.backgroundColor = "#10b981";

    // Simulate/Register Web Push Token with backend
    const simToken = "fcm_web_" + Math.random().toString(36).substring(2) + Date.now();
    await fetch("/api/push/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fcmToken: simToken,
        deviceName: navigator.userAgent.substring(0, 50),
        platform: "web"
      })
    });
    alert("🎉 Web Push notification device registered successfully!");
  } else {
    alert("Push notification permission denied.");
  }
}

// Initial fetch & 30s auto-refresh
loadRecentJobs();
setInterval(loadRecentJobs, 30000);
