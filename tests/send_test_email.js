// =====================================================================
// Instant SMTP Email Test Dispatcher
// =====================================================================

const config = require("../src/config/env");
const nodemailer = require("nodemailer");
const { renderJobAlertEmail } = require("../src/notifications/emailRenderer");

async function sendTestEmail() {
  console.log("=====================================================================");
  console.log("📧 SENDING TEST EMAIL ALERT VIA GMAIL SMTP");
  console.log("=====================================================================\n");

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass ? config.smtp.pass.replace(/\s+/g, '') : ''
    },
    tls: { rejectUnauthorized: false }
  });

  const sampleJob = {
    jobId: "test_verification_01",
    company: "Razorpay",
    title: "Junior Java Full Stack Developer (0-2 Years)",
    location: "Bengaluru, Karnataka, India",
    workMode: "Hybrid",
    publishedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    discoveredAt: new Date().toISOString(),
    jobAgeHours: 0.75,
    freshnessScore: 100,
    freshnessLabel: "Urgent (Posted < 1h ago)",
    source: "Greenhouse / Company Careers",
    salary: "₹8.0 - ₹12.0 LPA",
    jobReferenceId: "RZP-JAVA-2025",
    applicationUrl: "https://boards.greenhouse.io/razorpay/jobs/409210",
    companyCareersUrl: "https://razorpay.com/careers"
  };

  const sampleEval = {
    isEligible: true,
    matchScore: 92,
    matchLevel: "Excellent Match",
    roleMatch: 95,
    skillsMatch: 90,
    experienceMatch: 95,
    locationMatch: 100,
    educationMatch: 100,
    freshnessScore: 100,
    matchedSkills: ["Java 17", "Spring Boot", "REST APIs", "MySQL", "React.js", "Git"],
    missingSkills: ["Kafka"],
    experienceRequired: "0-2 years (2025 Graduates Eligible)",
    candidateExperienceSuitable: true,
    whyMatched: "Outstanding match with Java 17, Spring Boot, REST APIs, and React frontend. Suitable for early-career developers with 0-2 years experience.",
    applicationPriority: "Apply Immediately",
    confidence: 0.96
  };

  const sampleDispatch = {
    priorityLevel: "URGENT",
    badgeText: "🔥 URGENT ALERT (Posted < 1h)",
    badgeColor: "#dc2626"
  };

  const emailPayload = renderJobAlertEmail(sampleJob, sampleEval, sampleDispatch, config.timezone);

  console.log(`Sending email to: ${config.candidateEmail}...`);
  console.log(`Subject: ${emailPayload.subject}`);

  try {
    const info = await transporter.sendMail({
      from: config.smtp.from,
      to: config.candidateEmail,
      subject: emailPayload.subject,
      html: emailPayload.html,
      text: emailPayload.text
    });

    console.log(`\n🎉 SUCCESS! Email dispatched. MessageId: ${info.messageId}`);
    console.log(`👉 Check inbox for ${config.candidateEmail} (also check Spam/Promotions folder).`);
  } catch (err) {
    console.error(`❌ Send failed: ${err.message}`);
  }
}

sendTestEmail();
