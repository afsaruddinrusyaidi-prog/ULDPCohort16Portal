/**
 * ============================================================
 * ULDP 2026 — Participant Profile intake Form generator
 * ============================================================
 * Run createParticipantForm() ONCE from the same project as
 * Participants.gs. It builds the Google Form participants fill in,
 * with headers that match Participants.gs COLSPEC, links responses
 * into THIS sheet as the "Participants" tab, and adds the
 * Salt/PassHash/Status columns.
 *
 * NOTE: a profile PHOTO is a file-upload question. Apps Script
 * cannot create file-upload items, so add that ONE question by
 * hand in the Form editor afterwards (instructions logged + below).
 * ============================================================
 */
function createParticipantForm(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var form = FormApp.create('ULDP 2026 · Participant Profile')
    .setDescription('Set up your Cohort 16 profile — this is what your cohort sees in the member directory. ' +
      'Use the email you will sign in with.')
    .setCollectEmail(true)            // -> "Email Address" column
    .setLimitOneResponsePerUser(true)
    .setAllowResponseEdits(true)
    .setProgressBar(true)
    .setConfirmationMessage('Profile saved ✅  The programme team will send your login password separately.');

  form.addTextItem().setTitle('Full name').setRequired(true);
  form.addTextItem().setTitle('Preferred name').setHelpText('What your cohort should call you.').setRequired(true);

  var houseNames = ['House of Visionaries','House of Builders','House of Purpose','House of Connectors'];
  form.addListItem().setTitle('House').setHelpText('Leave for the team to fill if not yet revealed.').setChoiceValues(houseNames);

  form.addTextItem().setTitle('University').setRequired(true);

  var states = ['Johor','Kedah','Kelantan','Kuala Lumpur','Labuan','Melaka','Negeri Sembilan','Pahang','Penang','Perak','Perlis','Putrajaya','Sabah','Sarawak','Selangor','Terengganu'];
  form.addListItem().setTitle('Home state').setChoiceValues(states).setRequired(true);

  form.addTextItem().setTitle('Field of study').setHelpText('Your discipline / major.').setRequired(true);
  form.addTextItem().setTitle('Target industries').setHelpText('Where you want to build your career (e.g. Consulting · Tech).');

  var teams = []; for (var t=1;t<=8;t++) teams.push('Team ' + t);
  form.addListItem().setTitle('Team').setHelpText('Leave blank if not yet assigned.').setChoiceValues(teams);

  form.addTextItem().setTitle('Social connectivity link').setHelpText('LinkedIn / Instagram — how the cohort can connect with you.');
  form.addTextItem().setTitle('Personality profile').setHelpText('e.g. ENFP · Catalyst (optional).');
  form.addParagraphTextItem().setTitle('Ask me about').setHelpText('What you love talking about / can help with.');
  form.addParagraphTextItem().setTitle('Off-duty passions & hobbies').setHelpText('What you do for fun.');

  // ---- link responses into this spreadsheet, named "Participants" ----
  var beforeIds = ss.getSheets().map(function(s){ return s.getSheetId(); });
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  var newSheet = ss.getSheets().filter(function(s){ return beforeIds.indexOf(s.getSheetId()) === -1; })[0];
  if (newSheet){
    var existing = ss.getSheetByName('Participants');
    if (existing && existing.getSheetId() !== newSheet.getSheetId()){
      if (existing.getLastRow() < 2) ss.deleteSheet(existing);
      else newSheet.setName('Participants_Form');
    }
    if (ss.getSheetByName('Participants') == null) newSheet.setName('Participants');
  }

  // ensure workflow columns exist (Salt/PassHash/Status)
  sheet_();

  var editUrl = form.getEditUrl();
  var liveUrl = form.getPublishedUrl();
  Logger.log('FORM EDIT : ' + editUrl);
  Logger.log('FORM LIVE : ' + liveUrl + '   <- share with participants');
  Logger.log('ADD PHOTO : open the EDIT url -> Add question -> File upload -> title it "Profile picture".');
  return { edit: editUrl, live: liveUrl };
}
