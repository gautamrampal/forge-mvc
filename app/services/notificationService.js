const { createClient, HttpError } = require('../../core/helpers/httpClient');
const logger = require('../../core/helpers/logger');

// A worked example of calling ANOTHER SERVICE — the thing that separates SOA from a monolith.
//
// One client per downstream service, created once at module load. That matters: the circuit
// breaker lives on the client, so a client-per-call would create a fresh breaker every time and
// never accumulate enough failures to trip. It also means a failing notification service can't
// trip the circuit for, say, a billing service.
const notifications = createClient({
  name: 'notification-service',
  baseUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:5020',
  timeoutMs: Number(process.env.NOTIFICATION_TIMEOUT_MS ?? 3000),
  retries: 2,
});

// THE KEY DECISION IN ANY CROSS-SERVICE CALL: is this call essential to the operation, or
// incidental to it?
//
// Sending a welcome notification is incidental — the user account has already been created and
// committed. If the notification service is down, the correct behaviour is to log it and carry
// on. Propagating that failure would mean a healthy signup fails because an unrelated service is
// unwell, which is exactly the coupling SOA is supposed to avoid.
//
// Contrast with a payment authorisation before shipping an order: that IS essential, and must
// propagate. See `verifyPaymentOrThrow` below.
async function notifyUserCreated(user) {
  try {
    await notifications.post('/notifications', {
      type: 'user.created',
      userId: user.id,
      username: user.username,
    });
    logger.info(`Queued welcome notification for user ${user.id}`);
    return { delivered: true };
  } catch (err) {
    // Degrade, don't fail. The correlation id is already on the log line (see core/context.js),
    // so this entry joins to the signup request that triggered it.
    logger.warn(
      `Notification for user ${user.id} could not be delivered (${err.message}) — continuing anyway. ` +
        `In production this is where you'd enqueue a retry rather than drop it.`
    );
    return { delivered: false, reason: err.message };
  }
}

// The other half of the pattern: a call whose failure MUST stop the operation. Note it still
// distinguishes "the service said no" (a real answer — don't retry, don't trip the circuit) from
// "the service didn't answer" (infrastructure — retried and counted by the breaker).
async function verifyPaymentOrThrow(paymentId) {
  try {
    const result = await notifications.get(`/payments/${paymentId}`);
    if (!result.authorised) {
      const err = new Error('Payment was declined');
      err.status = 402;
      throw err;
    }
    return result;
  } catch (err) {
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
      // A definitive negative answer. Surface it as-is.
      throw err;
    }
    // Timeout, connection refused, 5xx, or an open circuit — we genuinely don't know the
    // outcome. Never assume success here; fail closed.
    logger.error(`Payment verification unavailable for ${paymentId}: ${err.message}`);
    const wrapped = new Error('Payment verification is temporarily unavailable. Please try again.');
    wrapped.status = 503;
    throw wrapped;
  }
}

// Exposed so a readiness check or an ops endpoint can report breaker state.
function circuitState() {
  return notifications.breaker();
}

module.exports = { notifyUserCreated, verifyPaymentOrThrow, circuitState, client: notifications };
