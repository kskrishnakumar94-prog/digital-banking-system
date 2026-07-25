/**
 * Centralized copy for all alert notifications, so wording stays
 * consistent whether it's sent by email or SMS.
 */

function largeTransactionAlert({ amount, threshold }) {
  const subject = 'Large Transaction Alert';
  const message = `A transaction of ${amount} on your account exceeded the ${threshold} monitoring threshold. If this wasn't you, contact support immediately.`;
  const html = `
    <h2>⚠️ Large Transaction Alert</h2>
    <p>A transaction of <strong>${amount}</strong> was just processed on your account, which exceeds our
    automatic monitoring threshold of <strong>${threshold}</strong>.</p>
    <p>If you recognize this transaction, no action is needed. If you did <strong>not</strong> authorize it,
    please contact support immediately and consider changing your password.</p>
  `;
  return { subject, message, html };
}

function velocityAlert({ count, windowMinutes }) {
  const subject = 'Unusual Transaction Activity';
  const message = `We noticed ${count} transactions from your account in the last ${windowMinutes} minutes. If this wasn't you, please review your account.`;
  const html = `
    <h2>⚠️ Unusual Transaction Activity</h2>
    <p>We detected <strong>${count}</strong> outgoing transactions from your account within the last
    <strong>${windowMinutes} minutes</strong> - more than our usual pattern for your account.</p>
    <p>If this was you, no action is needed. Otherwise, please review your recent transaction history and
    contact support if anything looks unfamiliar.</p>
  `;
  return { subject, message, html };
}

function loginBruteForceAlert({ attempts }) {
  const subject = 'Multiple Failed Login Attempts';
  const message = `We detected ${attempts} failed login attempts on your account. Your account has been temporarily locked for your protection.`;
  const html = `
    <h2>🔒 Account Temporarily Locked</h2>
    <p>We detected <strong>${attempts} failed login attempts</strong> on your account in a short period,
    and have temporarily locked it as a precaution.</p>
    <p>If this was you, simply wait for the lockout period to end and try again with the correct password.
    If this <strong>wasn't</strong> you, please reset your password as soon as the lockout period ends.</p>
  `;
  return { subject, message, html };
}

function newDeviceLoginAlert({ ipAddress, when }) {
  const subject = 'New Login Detected';
  const message = `A new login to your account was detected from IP ${ipAddress} at ${when}. If this wasn't you, please secure your account.`;
  const html = `
    <h2>🔑 New Login Detected</h2>
    <p>Your account was just accessed from a location/device we haven't seen before:</p>
    <ul>
      <li><strong>IP Address:</strong> ${ipAddress}</li>
      <li><strong>Time:</strong> ${when}</li>
    </ul>
    <p>If this was you, you can safely ignore this message. If you don't recognize this activity,
    please change your password and enable Two-Factor Authentication immediately.</p>
  `;
  return { subject, message, html };
}

function twoFactorStatusChanged({ enabled }) {
  const subject = enabled ? 'Two-Factor Authentication Enabled' : 'Two-Factor Authentication Disabled';
  const message = enabled
    ? 'Two-Factor Authentication has been enabled on your account.'
    : 'Two-Factor Authentication has been disabled on your account. We recommend keeping it enabled for better security.';
  const html = `<h2>${subject}</h2><p>${message}</p>`;
  return { subject, message, html };
}

function transferReceipt({ amount, counterpartyAccountNumber, newBalance, type }) {
  const verb = type === 'credit' ? 'received' : 'sent';
  const subject = `Transfer ${verb === 'received' ? 'Received' : 'Sent'}`;
  const message = `You ${verb} ${amount}. Your new balance is ${newBalance}.`;
  const html = `
    <h2>Transfer ${verb === 'received' ? 'Received' : 'Sent'}</h2>
    <p>You ${verb} <strong>${amount}</strong> ${verb === 'received' ? 'from' : 'to'} account
    <strong>${counterpartyAccountNumber}</strong>.</p>
    <p>Your new balance is <strong>${newBalance}</strong>.</p>
  `;
  return { subject, message, html };
}

module.exports = {
  largeTransactionAlert,
  velocityAlert,
  loginBruteForceAlert,
  newDeviceLoginAlert,
  twoFactorStatusChanged,
  transferReceipt,
};
