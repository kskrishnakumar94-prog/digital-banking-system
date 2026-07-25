const ScheduledTransferModel = require('../models/scheduledTransferModel');
const AccountModel = require('../models/accountModel');
const UserModel = require('../models/userModel');
const { executeTransfer } = require('../services/transferService');
const { notifyUser } = require('./notifications');
const logger = require('./logger');

const CHECK_INTERVAL_MS = Number(process.env.SCHEDULER_INTERVAL_MS || 60_000);

// After this many consecutive failed attempts, a recurring job is treated
// as permanently broken (e.g. the source account was closed, or the
// recipient account no longer exists) and auto-paused rather than retried
// forever. The owner is notified so they can fix or remove it.
const MAX_CONSECUTIVE_FAILURES = Number(process.env.MAX_SCHEDULED_TRANSFER_FAILURES || 5);

function computeNextRun(current, frequency) {
  const next = new Date(current);
  if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'monthly') next.setMonth(next.getMonth() + 1);
  return next;
}

async function notifyOwnerOfAutoPause(job, reason) {
  try {
    const user = await UserModel.findDetailById(job.user_id);
    if (!user) return;
    await notifyUser(user, {
      subject: 'Scheduled Transfer Paused',
      message: `Your scheduled transfer of ${job.amount} to ${job.to_account_number} has been automatically paused after ${MAX_CONSECUTIVE_FAILURES} failed attempts (${reason}). Please review it in Scheduled Transfers.`,
    });
  } catch (err) {
    logger.error(`Scheduler: failed to notify owner of auto-paused job ${job.id} - ${err.message}`);
  }
}

/**
 * Runs every scheduled transfer whose next_run_at has arrived, using the
 * exact same atomic transfer path as the HTTP endpoint (services/transferService.js).
 * A failed run (e.g. insufficient funds at execution time) is recorded and
 * left for the next cycle rather than silently retried in a loop - but a
 * job that fails MAX_CONSECUTIVE_FAILURES times in a row is auto-paused
 * instead of retried forever, since at that point it's very likely
 * permanently broken (closed account, bad recipient, etc.) rather than
 * hitting a transient issue.
 */
async function runDueTransfers() {
  let due;
  try {
    due = await ScheduledTransferModel.findDue();
  } catch (err) {
    logger.error(`Scheduler: failed to query due transfers - ${err.message}`);
    return;
  }

  for (const job of due) {
    try {
      const sourceAccount = await AccountModel.findById(job.from_account_id);
      if (!sourceAccount) {
        await ScheduledTransferModel.recordRunResult(job.id, { success: false, completed: true });
        logger.error(`Scheduler: scheduled transfer ${job.id} permanently failed - source account no longer exists.`);
        continue;
      }

      await executeTransfer({
        initiatingUserId: job.user_id,
        fromAccountNumber: sourceAccount.account_number,
        toAccountNumber: job.to_account_number,
        amount: Number(job.amount),
        description: job.description || 'Scheduled transfer',
      });

      const isRecurring = job.frequency === 'weekly' || job.frequency === 'monthly';
      await ScheduledTransferModel.recordRunResult(job.id, {
        success: true,
        completed: !isRecurring,
        nextRunAt: isRecurring ? computeNextRun(job.next_run_at, job.frequency) : null,
      });

      logger.info(`Scheduler: executed scheduled transfer ${job.id} (${job.amount} -> ${job.to_account_number})`);
    } catch (err) {
      const willHitLimit = job.consecutive_failures + 1 >= MAX_CONSECUTIVE_FAILURES;
      const updated = await ScheduledTransferModel.recordRunResult(job.id, {
        success: false,
        completed: false,
        autoPause: willHitLimit,
      });

      logger.error(
        `Scheduler: scheduled transfer ${job.id} failed (attempt ${updated?.consecutive_failures ?? '?'}/${MAX_CONSECUTIVE_FAILURES}) - ${err.message}`
      );

      if (willHitLimit) {
        notifyOwnerOfAutoPause(job, err.message).catch(() => {});
      }
    }
  }
}

let intervalHandle = null;

function startScheduler() {
  if (intervalHandle) return; // already running
  intervalHandle = setInterval(() => {
    runDueTransfers().catch((err) => logger.error(`Scheduler tick failed: ${err.message}`));
  }, CHECK_INTERVAL_MS);
  logger.info(`Scheduled-transfer worker started (checking every ${CHECK_INTERVAL_MS / 1000}s).`);
}

function stopScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startScheduler, stopScheduler, runDueTransfers };
