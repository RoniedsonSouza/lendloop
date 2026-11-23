// WF2: overdue reminder for one loan (plain text).
const loan = $('Loop over loans').first().json;
const due = new Date(`${loan.endDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const days = loan.daysOverdue === 1 ? '1 day' : `${loan.daysOverdue} days`;
return [{
  json: {
    to: loan.borrower.email,
    subject: `LendLoop · Reminder: please return the ${loan.toolName}`,
    text: `Hi ${loan.borrower.firstName},\n\nThe ${loan.toolName} was due back to ${loan.ownerFirstName} on ${due} (${days} ago). Please return it as soon as you can.\n\n${$env.LENDLOOP_APP_URL}/requests\n\n— LendLoop`,
  },
}];
