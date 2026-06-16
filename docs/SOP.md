# ULDP 2026 — Points Pipeline SOP
*Google Form → Google Sheet → Game Master approval → Public leaderboard*

## Roles (one paragraph each)

**Submitter (House Captain).** The Captain is the only person who submits points claims, via the Points Claim Form pinned on the portal's Captain page and in the Captains WhatsApp group. Every claim selects a claim type (**House** or **Individual/MVP**), the activity from the dropdown, and attaches evidence (photo, screenshot, or a clear text account). For Individual claims, the Captain names the member the points belong to — the Captain submits, but the points are the member's. Claims go in the same day the activity happens, before 9 PM.

**Game Master (Zaim).** The Game Master is the single approver. Nightly at 10 PM he opens the `Submissions` tab, filters Status = Pending, checks each claim's evidence against the `Catalog` entry for that activity, and marks **Approved** or **Rejected** (with a one-line reason). Approved rows flow automatically into `House_Standings` and `MVP` via formulas. He then spot-checks the public leaderboard re-rendered correctly and posts the nightly screenshot to the cohort WhatsApp group. Nothing appears publicly without his approval.

**Web/Data (Afsar).** Owns the Sheet structure, the `Catalog` mapping (activity → phase → public category), the Apps Script deployment, and the portal config. He never edits `Submissions` rows directly; structural changes (new activities, point values) happen only in `Catalog`, and any change is noted in the `ChangeLog` tab with date and reason.

## Data-integrity & audit checklist
- **Evidence rule:** no evidence → Rejected, no exceptions. Evidence must show the actual activity, not a re-creation.
- **Duplicates:** same activity + same house/member + same day → keep the first, reject the rest as `Duplicate`.
- **Submitter ≠ recipient check (Individual claims):** confirm the named member is in the Captain's house; reject cross-house claims.
- **Disputes:** houses raise disputes to the Game Master within 24h of the nightly post; he reviews evidence once, decision is final, logged in `ChangeLog`.
- **Version history:** never delete rows — Rejected rows stay with their reason. Google Sheets version history is the audit trail; do not copy-paste over ranges.
- **Caps:** `Catalog` carries per-activity caps (e.g. max claims/day); the Game Master enforces them at review.

## Nightly run-of-show (Game Master, ~20 min)
| Time | Step |
|---|---|
| 10:00 PM | Open `Submissions`, filter Pending |
| 10:02 | Review each claim vs `Catalog` (evidence, caps, duplicates, house membership) → Approve/Reject |
| 10:12 | Confirm `House_Standings` + `MVP` totals updated; sanity-check vs yesterday |
| 10:15 | Open the portal leaderboard, hard-refresh, confirm bars + MVP match the Sheet |
| 10:17 | Screenshot → post to cohort WhatsApp with one-line commentary |
| 10:20 | Note anything unusual in `ChangeLog`; done |

## Edge cases
- **Late claim (after 9 PM):** reviewed the next night; mark `Late` in notes. Final night of the programme: hard cutoff at points freeze — late = not counted.
- **Contested approval:** re-review once with both captains' input; Game Master decides; log it.
- **Missing evidence "it was live":** a second AF team member can vouch in writing (name them in notes); otherwise Rejected.
- **Apps Script down:** the portal falls back to its last cached payload; fix the deployment, then bump a cell in `House_Standings` to refresh the cache.
- **Wrong activity selected:** Reject with reason; Captain resubmits correctly (the Catalog mapping must stay clean for category totals).
