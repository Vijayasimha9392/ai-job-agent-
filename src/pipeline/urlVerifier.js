// =====================================================================
// Live HTTP Application URL Verification & Anti-Hallucination Engine
// =====================================================================

const GENERIC_CAREER_HOMEPAGES = [
  /^https?:\/\/(?:www\.)?jobs\.lever\.co\/[^\/]+\/?$/i,
  /^https?:\/\/(?:www\.)?job-boards\.greenhouse\.io\/[^\/]+\/?$/i,
  /^https?:\/\/(?:www\.)?job-boards\.greenhouse\.io\/[^\/]+\/jobs\/?$/i,
  /^https?:\/\/(?:www\.)?boards\.greenhouse\.io\/[^\/]+\/?$/i,
  /^https?:\/\/(?:www\.)?boards\.greenhouse\.io\/[^\/]+\/jobs\/?$/i,
  /^https?:\/\/(?:www\.)?jobs\.smartrecruiters\.com\/[^\/]+\/?$/i,
  /^https?:\/\/(?:www\.)?jobs\.ashbyhq\.com\/[^\/]+\/?$/i
];

const ERROR_URL_PATTERNS = [
  /error=true/i,
  /page-not-found/i,
  /job-expired/i,
  /404/i,
  /not-found/i,
  /vacancy-closed/i
];

const ERROR_PAGE_SNIPPETS = [
  "job not found",
  "page not found",
  "this job is no longer available",
  "this vacancy has closed",
  "opening has expired",
  "no longer accepting applications",
  "this posting has been removed",
  "the page you are looking for doesn't exist",
  "error 404",
  "404 - page not found"
];

/**
 * Validates whether an application URL is an exact, live, verified HTTP 200 vacancy link.
 * @param {object} job 
 * @returns {Promise<{ isValid: boolean, status: number|null, finalUrl: string, reason?: string }>}
 */
async function verifyApplicationUrl(job) {
  const url = (job.applicationUrl || "").trim();

  // 1. Basic URL Structure Check
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    return {
      isValid: false,
      status: null,
      finalUrl: url,
      reason: "Missing or invalid protocol (must start with http:// or https://)"
    };
  }

  // 2. Reject Generic Company Career Homepages (Must be individual vacancy)
  for (const pattern of GENERIC_CAREER_HOMEPAGES) {
    if (pattern.test(url)) {
      return {
        isValid: false,
        status: null,
        finalUrl: url,
        reason: `Generic career homepage detected ("${url}") instead of exact job vacancy URL`
      };
    }
  }

  // 3. Reject Known Error URL Patterns
  for (const errPattern of ERROR_URL_PATTERNS) {
    if (errPattern.test(url)) {
      return {
        isValid: false,
        status: null,
        finalUrl: url,
        reason: `URL contains error query parameter or error path: "${url}"`
      };
    }
  }

  // 4. Perform Live HTTP Verification Request
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000)
    });

    const status = response.status;
    const finalUrl = response.url || url;

    // Accept only HTTP 200-399
    if (status < 200 || status >= 400) {
      return {
        isValid: false,
        status,
        finalUrl,
        reason: `HTTP ${status} response from destination portal`
      };
    }

    // Check if redirected to an error or generic page
    for (const errPattern of ERROR_URL_PATTERNS) {
      if (errPattern.test(finalUrl)) {
        return {
          isValid: false,
          status,
          finalUrl,
          reason: `Redirected to error page: "${finalUrl}"`
        };
      }
    }

    for (const pattern of GENERIC_CAREER_HOMEPAGES) {
      if (pattern.test(finalUrl)) {
        return {
          isValid: false,
          status,
          finalUrl,
          reason: `Redirected to generic career homepage: "${finalUrl}"`
        };
      }
    }

    // Inspect first 8KB of response HTML for "Job not found" error indicators
    try {
      const textChunk = (await response.text()).slice(0, 8000).toLowerCase();
      for (const snippet of ERROR_PAGE_SNIPPETS) {
        if (textChunk.includes(snippet)) {
          return {
            isValid: false,
            status,
            finalUrl,
            reason: `Page content contains error indicator: "${snippet}"`
          };
        }
      }
    } catch (readErr) {
      // Body reading error is non-fatal if HTTP 200
    }

    return {
      isValid: true,
      status,
      finalUrl
    };
  } catch (err) {
    return {
      isValid: false,
      status: null,
      finalUrl: url,
      reason: `Live HTTP connection failed: ${err.message}`
    };
  }
}

/**
 * Concurrently verifies a batch of candidate job URLs
 * @param {Array<object>} items 
 * @returns {Promise<Array<object>>} Only verified items
 */
async function verifyCandidateBatch(items = []) {
  if (!items || items.length === 0) return [];

  const verifiedItems = [];
  for (const item of items) {
    const job = item.job || item;
    const verification = await verifyApplicationUrl(job);

    if (verification.isValid) {
      job.applicationUrlVerified = true;
      job.sourceVerified = true;
      job.verifiedAt = new Date().toISOString();
      verifiedItems.push(item);
      console.log(`✅ [URL Verifier] HTTP ${verification.status} Verified: "${job.title}" at "${job.company}" (${job.applicationUrl})`);
    } else {
      job.applicationUrlVerified = false;
      console.warn(`🛑 [URL Verifier BLOCKED] "${job.title}" at "${job.company}" -> ${verification.reason}`);
    }
  }

  return verifiedItems;
}

module.exports = {
  verifyApplicationUrl,
  verifyCandidateBatch,
  GENERIC_CAREER_HOMEPAGES,
  ERROR_URL_PATTERNS
};
