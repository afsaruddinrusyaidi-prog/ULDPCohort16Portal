/**
 * ============================================================
 * ULDP 2026 — Points Claim Form generator
 * ============================================================
 * Run createPointsForm() ONCE from the same Apps Script project
 * that holds Code.gs. It will:
 *   1. Build the Google Form with the exact questions the engine
 *      expects (headers matched to COLSPEC in Code.gs).
 *   2. Turn on "collect email" (becomes the `submitter` column).
 *   3. Link responses to THIS spreadsheet and name the tab
 *      "Submissions" so the engine reads it.
 *   4. Add the workflow columns + rebuild the empty board.
 *
 * It then logs three URLs:
 *   • Form EDIT url    — to tweak wording later
 *   • Form LIVE url    — share this with House Captains
 *   • Form EMBED url   — paste into config.js -> FORM_EMBED_URL
 *
 * Re-running makes a NEW form. To edit questions later, open the
 * EDIT url instead of re-running. (Reuses HOUSES / CATEGORIES /
 * SHEET_SUBMISSIONS already defined in Code.gs.)
 * ============================================================
 */
function createPointsForm() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var form = FormApp.create('ULDP 2026 · Points Claim')
    .setDescription('Submit a House or Individual (MVP) points claim. ' +
      'The programme team reviews every claim before it appears on the leaderboard. ' +
      'Attach evidence wherever you can.')
    .setCollectEmail(true)            // -> "Email Address" column -> submitter
    .setLimitOneResponsePerUser(false)
    .setAllowResponseEdits(false)
    .setProgressBar(false)
    .setConfirmationMessage('Got it ✅  Your claim is in the review queue. ' +
      'Once approved it shows up on the leaderboard within a minute.');

  // 1. Claim type  -> type
  form.addMultipleChoiceItem()
    .setTitle('Claim type')
    .setHelpText('Is this for the whole House, or an individual member (MVP race)?')
    .setChoiceValues(['House points', 'Individual (MVP) points'])
    .setRequired(true);

  // 2. House  -> house
  var houseNames = Object.keys(HOUSES).map(function (k) { return HOUSES[k]; });
  form.addMultipleChoiceItem()
    .setTitle('House')
    .setChoiceValues(houseNames)
    .setRequired(true);

  // 3. Participant name  -> member
  form.addTextItem()
    .setTitle('Participant name')
    .setHelpText('Only for Individual (MVP) claims — whose points are these? ' +
      'Leave blank for House-wide claims.');

  // 4. Activity  -> activity
  form.addParagraphTextItem()
    .setTitle('Activity')
    .setHelpText('What happened? Be specific — this is what the reviewer sees.')
    .setRequired(true);

  // 5. Category  -> category
  form.addMultipleChoiceItem()
    .setTitle('Category')
    .setHelpText('Which front does this fall under?')
    .setChoiceValues(CATEGORIES)      // Community / Challenges / Spirit
    .setRequired(true);

  // 6. Points  -> points  (number validation, optional — staff confirm)
  var pts = form.addTextItem()
    .setTitle('Points')
    .setHelpText('Suggested points. Leave blank if unsure — the programme team confirms the final value.');
  try {
    pts.setValidation(FormApp.createTextValidation()
      .setHelpText('Enter a whole number.')
      .requireNumber().build());
  } catch (err) { /* validation is best-effort */ }

  // 7. Evidence  -> evidence
  // NOTE: Google Apps Script CANNOT create a file-upload question
  // (FormApp has no FileUploadItem). To let captains upload a photo
  // directly, add that question BY HAND in the Form editor:
  //   + Add question -> "File upload" -> title it "Evidence"
  // The Sheet then stores a clickable Drive link the staff console
  // shows as "evidence". Because the title contains "evidence" it is
  // matched automatically by COLSPEC — no code change needed.
  //
  // The text field below is a fallback for captains who only have a
  // URL (e.g. an Instagram post). If you add the upload question,
  // DELETE this text item or rename it to "Reference note" so the
  // engine reads the upload column instead (it reads the left-most
  // evidence-matching column).
  form.addTextItem()
    .setTitle('Evidence link')
    .setHelpText('Paste a link to a photo, Google Drive file, post, or screenshot — ' +
      'or skip this and use the upload question below.');

  // ---- Link responses to this spreadsheet, named "Submissions" ----
  var beforeIds = ss.getSheets().map(function (s) { return s.getSheetId(); });
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();

  // find the freshly-created response sheet
  var newSheet = ss.getSheets().filter(function (s) {
    return beforeIds.indexOf(s.getSheetId()) === -1;
  })[0];

  if (newSheet) {
    // remove a pre-existing EMPTY Submissions tab (e.g. from setup()),
    // then rename the linked response tab to Submissions.
    var existing = ss.getSheetByName(SHEET_SUBMISSIONS);
    if (existing && existing.getSheetId() !== newSheet.getSheetId()) {
      if (existing.getLastRow() < 2) ss.deleteSheet(existing);
      else newSheet.setName(SHEET_SUBMISSIONS + '_Form'); // don't clobber real data
    }
    if (ss.getSheetByName(SHEET_SUBMISSIONS) == null) {
      newSheet.setName(SHEET_SUBMISSIONS);
    }
  }

  // ensure workflow columns + a clean empty board
  getSubmissionsSheet_(ss);
  recomputeAggregates_(ss);

  var editUrl  = form.getEditUrl();
  var liveUrl  = form.getPublishedUrl();
  var embedUrl = liveUrl.replace('/viewform', '/viewform?embedded=true');

  Logger.log('FORM EDIT  : ' + editUrl);
  Logger.log('FORM LIVE  : ' + liveUrl);
  Logger.log('FORM EMBED : ' + embedUrl + '   <- config.js FORM_EMBED_URL');

  return { edit: editUrl, live: liveUrl, embed: embedUrl };
}
