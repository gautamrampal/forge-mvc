const { getRequestId } = require('../context');
const logger = require('./logger');

// Calling another service over HTTP. Built on Node 18+'s global fetch, so no dependency.
//
// The reason this file exists rather than calling fetch() directly: a bare fetch has NO timeout.
// If a sibling service stops responding — not refuses, just stops — your request hangs until the
// OS gives up, which can be minutes. Every request waiting on it holds a connection, your pool
// exhausts, and your own service goes down because someone else's did. That is a cascading
// failure, and it is the single most common way a service architecture falls over.
//
// Three layers of protection, each solving a different failure mode:
//
//   TIMEOUT          bounds a single slow call
//   RETRY + BACKOFF  rides out a brief blip, without stampeding
//   CIRCUIT BREAKER  stops calling a service that is properly down, so it can recover — and so
//                    you fail fast instead of making every caller wait for the timeout

// --- Circuit breaker ---------------------------------------------------------------------------
//
//   CLOSED     normal. Count failures; at the threshold, trip to OPEN.
//   OPEN       fail immediately without making the call. After resetTimeout, allow one probe.
//   HALF_OPEN  one trial request. Success -> CLOSED. Failure -> OPEN again.
const STATES = { CLOSED: 'closed', OPEN: 'open', HALF_OPEN: 'half_open' };

class CircuitBreaker {
  constructor({ name, failureThreshold = 5, resetTimeoutMs = 30000 }) {
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.openedAt = 0;
  }

  canAttempt() {
    if (this.state === STATES.CLOSED) return true;
    if (this.state === STATES.OPEN) {
      if (Date.now() - this.openedAt >= this.resetTimeoutMs) {
        this.state = STATES.HALF_OPEN;
        logger.info(`Circuit for "${this.name}" is half-open — probing with one request`);
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN: allow the single probe
  }

  onSuccess() {
    if (this.state !== STATES.CLOSED) {
      logger.info(`Circuit for "${this.name}" closed — service recovered`);
    }
    this.state = STATES.CLOSED;
    this.failures = 0;
  }

  onFailure() {
    this.failures += 1;
    // A failed probe in HALF_OPEN re-opens immediately: the service is still unwell, so don't
    // spend another `failureThreshold` requests rediscovering that.
    if (this.state === STATES.HALF_OPEN || this.failures >= this.failureThreshold) {
      if (this.state !== STATES.OPEN) {
        logger.error(`Circuit for "${this.name}" OPENED after ${this.failures} failure(s) — failing fast for ${this.resetTimeoutMs}ms`);
      }
      this.state = STATES.OPEN;
      this.openedAt = Date.now();
    }
  }

  snapshot() {
    return { name: this.name, state: this.state, failures: this.failures };
  }
}

const breakers = new Map();
function breakerFor(name, options) {
  if (!breakers.has(name)) breakers.set(name, new CircuitBreaker({ name, ...options }));
  return breakers.get(name);
}

class HttpError extends Error {
  constructor(message, { status, body, url, method } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.url = url;
    this.method = method;
  }
}

// Only these are safe to retry automatically. Retrying a POST could create two orders; the
// caller must opt in explicitly (and ideally send an idempotency key) if that's acceptable.
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
// 5xx and 429 are "try again"; 4xx means the request itself is wrong and will fail identically
// however many times you send it.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * createClient({ name, baseUrl, ... }) — one client per downstream service, so each gets its own
 * circuit breaker. A failing billing service must not trip the circuit for the users service.
 */
function createClient({
  name,
  baseUrl = '',
  timeoutMs = 5000,
  retries = 2,
  retryDelayMs = 200,
  failureThreshold = 5,
  resetTimeoutMs = 30000,
  defaultHeaders = {},
} = {}) {
  if (!name) throw new Error('createClient({ name }) is required — the name identifies the circuit breaker.');
  const breaker = breakerFor(name, { failureThreshold, resetTimeoutMs });

  async function request(method, path, { body, headers = {}, timeout = timeoutMs, retry } = {}) {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    const upper = method.toUpperCase();
    const maxAttempts = (retry ?? (IDEMPOTENT_METHODS.has(upper) ? retries : 0)) + 1;

    if (!breaker.canAttempt()) {
      throw new HttpError(`Circuit open for "${name}" — not attempting ${upper} ${url}`, { url, method: upper });
    }

    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // AbortController is what actually enforces the timeout — fetch has none of its own.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const requestId = getRequestId();
        const res = await fetch(url, {
          method: upper,
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            // Propagate the correlation id so the downstream service's logs join to ours.
            // This is what makes a distributed trace possible at all.
            ...(requestId ? { 'X-Request-Id': requestId } : {}),
            ...defaultHeaders,
            ...headers,
          },
          ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
        });
        clearTimeout(timer);

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const error = new HttpError(`${upper} ${url} -> ${res.status}`, {
            status: res.status,
            body: text,
            url,
            method: upper,
          });

          if (RETRYABLE_STATUS.has(res.status) && attempt < maxAttempts) {
            lastError = error;
            await backoff(attempt, retryDelayMs, name, `${res.status}`);
            continue;
          }
          // A 4xx is the caller's fault, not the service being unhealthy — it must not count
          // toward opening the circuit, or a burst of bad requests would take out a fine service.
          if (res.status >= 500) breaker.onFailure();
          throw error;
        }

        breaker.onSuccess();
        const contentType = res.headers.get('content-type') || '';
        return contentType.includes('application/json') ? res.json() : res.text();
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof HttpError) throw err;

        // Network-level failure: DNS, connection refused, or our own abort firing.
        const isTimeout = err.name === 'AbortError';
        lastError = isTimeout
          ? new HttpError(`${upper} ${url} timed out after ${timeout}ms`, { url, method: upper })
          : new HttpError(`${upper} ${url} failed: ${err.message}`, { url, method: upper });

        if (attempt < maxAttempts) {
          await backoff(attempt, retryDelayMs, name, isTimeout ? 'timeout' : err.message);
          continue;
        }
        breaker.onFailure();
        throw lastError;
      }
    }

    breaker.onFailure();
    throw lastError;
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts) => request('POST', path, { ...opts, body }),
    put: (path, body, opts) => request('PUT', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
    request,
    breaker: () => breaker.snapshot(),
  };
}

// Exponential backoff with jitter. The jitter matters: without it, every caller that failed at
// the same moment retries at the same moment, and the recovering service is knocked straight
// back over by the synchronised wave. That's the thundering-herd problem.
async function backoff(attempt, baseMs, name, reason) {
  const delay = baseMs * 2 ** (attempt - 1);
  const jittered = Math.round(delay * (0.5 + Math.random() * 0.5));
  logger.warn(`"${name}" attempt ${attempt} failed (${reason}) — retrying in ${jittered}ms`);
  await sleep(jittered);
}

// Test/ops helper: inspect or reset every breaker.
function circuitSnapshot() {
  return [...breakers.values()].map((b) => b.snapshot());
}
function resetCircuits() {
  breakers.clear();
}

module.exports = { createClient, HttpError, circuitSnapshot, resetCircuits, STATES };
