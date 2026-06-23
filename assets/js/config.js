/* ============================================================
   ULDP 2026 Portal — central config
   Fill these in once the Google Form / Apps Script are live.
   ============================================================ */
window.ULDP = {
  // Apps Script Web App URL (deploy /apps-script/Code.gs, paste the /exec URL here)
  API_URL: "https://script.google.com/macros/s/AKfycbzUM81Z3idK4Wy3BmVQX9Lhh7d0bUDHUngdQB4swGlYOhON5kVBRPCauENHDkr018Yf/exec",

  // Embedded Points Claim Google Form (the "embed" URL ending in ?embedded=true)
  FORM_EMBED_URL: "https://docs.google.com/forms/d/e/1FAIpQLScVtOk8DC1tveQ8eHmYherzsSyDlzCRx82Ux6DIEJZfcP_YnA/viewform?embedded=true",

  // Staff approval console — same Apps Script /exec URL + "?page=staff".
  // Leave blank to hide the discreet "Staff" footer link.
  STAFF_CONSOLE_URL: "https://script.google.com/macros/s/AKfycbzUM81Z3idK4Wy3BmVQX9Lhh7d0bUDHUngdQB4swGlYOhON5kVBRPCauENHDkr018Yf/exec?page=staff",

  // Captain access code for submit.html (client-side gate; the Form itself
  // should ALSO restrict to logged-in Google accounts for real protection)
  CAPTAIN_CODE: "C16-CAPTAIN",

  // Leaderboard switches on automatically from this date (before = placeholder)
  LEADERBOARD_LIVE_FROM: "2026-06-26T00:00:00+08:00",   // House Reveal Day

  // Countdown targets
  DATES: {
    reveal:   "2026-06-26T20:00:00+08:00",
    virtual:  "2026-07-18T09:00:00+08:00",
    physical: "2026-07-23T09:00:00+08:00"
  },

  // House registry (slug -> display + CSS var)
  HOUSES: [
    { slug: "visionaries", name: "House of Visionaries", color: "#1E2A4A" },
    { slug: "builders",    name: "House of Builders",    color: "#E8931A" },
    { slug: "purpose",     name: "House of Purpose",     color: "#6B2FA0" },
    { slug: "connectors",  name: "House of Connectors",  color: "#0D9488" }
  ],

  // Public category colours (generic buckets — never activity names)
  CATEGORIES: { Community: "#29ABE2", Challenges: "#F7C842", Spirit: "#E91E8C" },

  REFRESH_MS: 5 * 60 * 1000          // leaderboard auto-refresh
};
