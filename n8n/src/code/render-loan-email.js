// WF1: plain-text email (no HTML: user-provided tool names can't inject markup).
const e = $('Verify signature').first().json.event;
const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const range = `${fmt(e.loan.startDate)} – ${fmt(e.loan.endDate)}`;
const tool = e.loan.toolName;
const who = e.counterpartFirstName;
const templates = {
  'loan.requested': [`New request for your ${tool}`, `${who} would like to borrow your ${tool} (${range}).\nApprove or decline: ${e.link}`],
  'loan.approved': [`Approved: ${tool}`, `${who} approved your request to borrow the ${tool} (${range}).\nPick-up details: ${e.link}`],
  'loan.declined': [`Request declined: ${tool}`, `Your request to borrow the ${tool} (${range}) was declined.\nBrowse other tools: ${e.link}`],
  'loan.cancelled': [`Cancelled: ${tool}`, `The loan of the ${tool} (${range}) was cancelled.\nDetails: ${e.link}`],
  'loan.returned': [`Return confirmed: ${tool}`, `${who} confirmed the ${tool} is back. Thanks for being a good neighbor!\n${e.link}`],
};
const [subject, body] = templates[e.type] || [`Update on ${tool}`, `There is an update on the ${tool}.\n${e.link}`];
return [{ json: { to: e.recipient.email, subject: `LendLoop · ${subject}`, text: `Hi ${e.recipient.firstName},\n\n${body}\n\n— LendLoop` } }];
