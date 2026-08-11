# Forge MVC — Running as a Service

Everything in this document is about surviving in a world where your process is **restarted
constantly**, **called by other processes**, and **calls other processes that will fail**.

If you're building a single app on one box, you can skip this. If you're deploying to
Kubernetes, ECS, Docker Compose or PM2 — or splitting a monolith into services — read it.

> For the framework basics see **[TUTORIAL.md](./TUTORIAL.md)**; for CRUD see
> **[TUTORIAL-EJS.md](./TUTORIAL-EJS.md)** or **[TUTORIAL-TSX.md](./TUTORIAL-TSX.md)**.

---

## Contents

1. [What "service-ready" actually requires](#1-what-service-ready-actually-requires)
2. [Graceful shutdown](#2-graceful-shutdown)
3. [Health vs readiness](#3-health-vs-readiness)
4. [Correlation IDs and joinable logs](#4-correlation-ids-and-joinable-logs)
5. [Calling other services](#5-calling-other-services)
6. [Essential vs incidental calls](#6-essential-vs-incidental-calls)
7. [CORS](#7-cors)
8. [Rate limiting](#8-rate-limiting)
9. [Docker](#9-docker)
10. [Kubernetes / orchestrator config](#10-kubernetes--orchestrator-config)
11. [Splitting into services](#11-splitting-into-services)
12. [What is still missing](#12-what-is-still-missing)

---

## 1. What "service-ready" actually requires

A service is not just "an app with a JSON API". It has to cope with three realities a monolith
never faces:

| Reality | What it demands | Where it lives |
|---|---|---|
| Your process is killed and restarted constantly | Graceful shutdown, readiness gating | `core/lifecycle.js` |
| An orchestrator decides if you live or die | Correct liveness vs readiness | `core/health.js` |
| One request spans several services | Correlation IDs on every log line | `core/context.js` |
| The services you call **will** fail | Timeouts, retries, circuit breakers | `core/helpers/httpClient.js` |
| Callers come from other origins / at volume | CORS, rate limiting | `core/middlewares/` |

All of it is wired by default. `APP_MODE=api` turns off views and gives you a clean JSON
service; everything below applies in any mode.

---

## 2. Graceful shutdown

**The problem.** Every deploy, scale event and node drain sends your process `SIGTERM`, then
`SIGKILL`s it seconds later. Node's default `SIGTERM` behaviour is to die immediately —
in-flight requests dropped mid-response, database connections left dangling. A rolling deploy
becomes a burst of 502s.

`core/lifecycle.js` handles it, and **the order is the whole point**:

```
1. Flip readiness to false, then WAIT (PRE_STOP_DELAY_MS)
2. Stop accepting new connections; let in-flight ones finish
3. Reap idle keep-alive sockets
4. Close the database pool
5. Exit — or force-exit at SHUTDOWN_TIMEOUT_MS
```

**Step 1 is the one people skip.** A load balancer only notices you're going away on its *next*
readiness poll. Stop accepting before it re-checks and it keeps routing to a closed socket. That
pause is what turns a rolling deploy from "some 502s" into "none". Set `PRE_STOP_DELAY_MS` to
roughly twice your probe interval.

It's already installed in `server.js`:

```js
const server = app.listen(PORT, () => {
  lifecycle.setReady(true);   // /ready returns 503 until this line
});
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS ?? 65000);
server.headersTimeout = server.keepAliveTimeout + 5000;

lifecycle.install({ server, db });
```

Add your own teardown with `onShutdown`:

```js
lifecycle.install({
  server,
  db,
  onShutdown: async () => {
    await messageQueue.drain();
    await serviceRegistry.deregister();
  },
});
```

> **A subtlety worth knowing.** `server.close()` waits for connections to *end*, and a keep-alive
> socket doesn't end just because its response finished. `closeIdleConnections()` reaps those —
> but a connection still mid-request becomes idle a moment *later*, after you'd already swept.
> Calling it once leaves the last connection hanging until the client's own timeout. Measured
> here: **4.4 seconds of dead wait on a request that took 800ms.** `lifecycle.js` sweeps on a
> 50ms interval instead, which brought the same shutdown down to **848ms**.

**`keepAliveTimeout` must exceed your load balancer's idle timeout.** If Node closes a socket at
the same moment the LB reuses it, you get random, unreproducible 502s.

Unhandled rejections and uncaught exceptions also trigger shutdown. A process in an unknown state
should be replaced, not left limping on serving corrupt responses.

---

## 3. Health vs readiness

Two endpoints that look alike and mean completely different things. Confusing them is a common
cause of **self-inflicted outages**.

| | `GET /health` | `GET /ready` |
|---|---|---|
| Question | "Is this process alive?" | "Should traffic route here now?" |
| Checks | Nothing external | Database + your custom checks |
| Failure means | **Restart this container** | **Remove from the load balancer** |
| During shutdown | Still 200 | 503 immediately |

**Why liveness must not check the database.** A failed liveness probe restarts the container. If
liveness checked the DB, a 30-second database blip would fail the probe on *every instance at
once*, and the orchestrator would restart your entire fleet — turning a brief wobble into a full
outage, with a thundering herd of reconnects on top. Readiness failing merely removes an instance
from rotation, which is recoverable and reverses itself.

```bash
curl localhost:5010/health
# {"status":"ok","service":"forge-mvc","version":"1.0.0","uptimeSeconds":34}

curl localhost:5010/ready
# {"status":"ready","checks":[{"name":"database","driver":"mysql","status":"up","latencyMs":2}]}
```

Add your own dependency checks:

```js
const app = createApp({
  appDir,
  healthChecks: [
    async () => ({ name: 'redis', status: (await redis.ping()) === 'PONG' ? 'up' : 'down' }),
  ],
});
```

Every check is bounded by `READY_CHECK_TIMEOUT_MS` — a probe that hangs is read as a failure
anyway, and meanwhile it ties up a connection on every poll.

Probes are mounted **before** auth, sessions, CORS and the rate limiter. The orchestrator has no
credentials, and throttling a liveness probe gets your container restarted.

---

## 4. Correlation IDs and joinable logs

In a service architecture one user action fans out across several services. Without a shared id,
your logs are a pile of disconnected lines and debugging is guesswork.

`core/middlewares/requestId.js` runs first in the chain. It accepts an inbound `X-Request-Id` (or
`X-Correlation-Id`), or mints a UUID, and puts it on an `AsyncLocalStorage` context.

**Nothing at the call site changes.** `logger.info('saved')` inside a model, three `await`s deep,
comes out tagged with the request that triggered it:

```json
{"level":"info","message":"saved","service":"forge-mvc","requestId":"7f3a…","timestamp":"…"}
```

The alternative — threading `requestId` through every function signature — poisons every API in
the codebase for the sake of logging.

Enrich the context once auth resolves, and later lines carry it too:

```js
const { setContextValue } = require('./core/context');
setContextValue('userId', user.id);
```

The id is echoed in the response header so a caller (or a browser devtools network tab) can
correlate from their side, and `httpClient` forwards it on every outbound call — which is what
makes an end-to-end trace possible at all.

**Inbound ids are sanitised**, not trusted: bounded to 128 chars and stripped to `[\w.-]`. An
unvalidated header lands in your log files and response headers, where CR/LF could forge log
lines or smuggle a header.

---

## 5. Calling other services

**Never call another service with a bare `fetch()`.** `fetch` has no timeout. If a sibling stops
responding — not refuses, just stops — your request hangs until the OS gives up, which can be
minutes. Every waiting request holds a connection, your pool exhausts, and your service goes down
because someone else's did. That is a **cascading failure**, and it's the most common way a
service architecture falls over.

`core/helpers/httpClient.js` gives you three layers, each for a different failure mode:

| Layer | Solves |
|---|---|
| **Timeout** | one slow call |
| **Retry + jittered backoff** | a brief blip |
| **Circuit breaker** | a service that is properly down |

```js
const { createClient } = require('./core/helpers/httpClient');

// One client per downstream service, created ONCE at module load.
const billing = createClient({
  name: 'billing-service',              // names the circuit breaker
  baseUrl: process.env.BILLING_URL,
  timeoutMs: 3000,
  retries: 2,
  failureThreshold: 5,                  // failures before the circuit opens
  resetTimeoutMs: 30000,                // how long to fail fast before probing again
});

const invoice = await billing.get(`/invoices/${id}`);
await billing.post('/invoices', { amount: 500 });
```

**Create the client once, at module scope.** The circuit breaker lives on the client — a
client-per-call makes a fresh breaker every time and never accumulates enough failures to trip.
One client per service also means a failing billing service can't trip the circuit for users.

### How the breaker behaves

```
CLOSED ──[failureThreshold failures]──> OPEN ──[resetTimeoutMs]──> HALF_OPEN
   ^                                                                   │
   └──────────────────[probe succeeds]─────────────────────────────────┘
                       [probe fails] ──> OPEN again
```

While OPEN, calls fail **immediately** without touching the network. That's the point: you stop
piling load onto a struggling service, and your own callers fail fast instead of each waiting out
the full timeout.

### The rules it applies for you

- **Only idempotent methods retry** (`GET`/`HEAD`/`PUT`/`DELETE`/`OPTIONS`). Retrying a `POST`
  could create two orders. Opt in explicitly with `{ retry: 2 }` if you know it's safe.
- **Only 5xx/408/429 retry.** A 4xx means your request is wrong and will fail identically forever.
- **4xx does not count toward opening the circuit.** Otherwise a burst of malformed client
  requests would trip the breaker on a perfectly healthy service.
- **Backoff is jittered.** Without jitter, everyone who failed at the same moment retries at the
  same moment and knocks the recovering service straight back over — the thundering herd.

---

## 6. Essential vs incidental calls

**The single most important decision in any cross-service call**: is this call essential to the
operation, or incidental to it?

`app/services/notificationService.js` shows both.

**Incidental — degrade and continue.** The user account is already created and committed. If the
notification service is down, log it and carry on. Propagating that failure would mean a healthy
signup fails because an unrelated service is unwell — exactly the coupling SOA exists to avoid.

```js
async function notifyUserCreated(user) {
  try {
    await notifications.post('/notifications', { type: 'user.created', userId: user.id });
    return { delivered: true };
  } catch (err) {
    logger.warn(`Notification for user ${user.id} undelivered (${err.message}) — continuing`);
    return { delivered: false, reason: err.message };
  }
}
```

**Essential — propagate, and fail closed.** Note it distinguishes "the service said no" (a real
answer — don't retry, don't trip the circuit) from "the service didn't answer" (infrastructure):

```js
catch (err) {
  if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
    throw err;                          // a definitive negative answer
  }
  // Timeout, refused, 5xx, or open circuit — we genuinely don't know the outcome.
  // Never assume success here.
  const wrapped = new Error('Payment verification is temporarily unavailable.');
  wrapped.status = 503;
  throw wrapped;
}
```

If you find yourself with many incidental calls, that's the signal to introduce a message queue
and make them asynchronous — see [§12](#12-what-is-still-missing).

---

## 7. CORS

Off by default (same-origin only). Turn it on with an allowlist:

```ini
CORS_ORIGINS=https://app.example.com,https://admin.example.com
CORS_CREDENTIALS=true      # only when the browser must send cookies or Authorization
```

`core/middlewares/cors.js` is hand-rolled and short, because CORS is a security control you
should be able to read. It sets `Vary: Origin` (so a shared cache can't hand one origin's
response to another), exposes `X-Request-Id` to client JS, and short-circuits preflight.

**`CORS_ORIGINS=*` with `CORS_CREDENTIALS=true` throws at boot.** The combination is invalid per
spec and browsers silently reject it — crashing at startup beats debugging a phantom CORS error
in production.

---

## 8. Rate limiting

On by default: 300 requests per 15 minutes per IP, with health probes exempt.

```ini
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_MAX=10     # much tighter — credential stuffing is a volume game
```

Apply the strict limiter to auth routes:

```js
const { createAuthRateLimiter } = require('../../core/middlewares/rateLimit');
router.post('/login', createAuthRateLimiter(), loginRules, validate, AuthController.login);
```

> ⚠️ **The default store is per-process memory.** With three instances behind a load balancer a
> limit of 100 becomes an effective 300, and a restart resets every counter. That's a crude abuse
> brake, not a correct limit. For real enforcement across a fleet:
>
> ```bash
> npm install rate-limit-redis ioredis
> ```
> ```js
> createRateLimiter({ store: new RedisStore({ sendCommand: (...a) => redis.call(...a) }) })
> ```

---

## 9. Docker

```bash
docker build -t my-service .
docker run -p 5010:5010 --env-file .env my-service
```

Three deliberate choices in the `Dockerfile`:

**`dumb-init` as PID 1.** Without it Node *is* PID 1 — and PID 1 on Linux ignores signals that
have no explicit handler. Your graceful shutdown never runs and every deploy becomes a hard kill.

**`USER node`.** A container escape from a root process is a host compromise.

**Dependencies in a separate stage.** `COPY package*.json` before the source means the
`npm ci` layer is cached and only rebuilds when dependencies actually change.

The `HEALTHCHECK` hits `/health`. Orchestrators generally use their own probes against the same
paths.

---

## 10. Kubernetes / orchestrator config

The settings that make the above actually work:

```yaml
spec:
  # Must exceed PRE_STOP_DELAY_MS + drain time, or Kubernetes SIGKILLs mid-drain.
  terminationGracePeriodSeconds: 30
  containers:
    - name: my-service
      livenessProbe:
        httpGet: { path: /health, port: 5010 }
        periodSeconds: 10
        failureThreshold: 3
      readinessProbe:
        httpGet: { path: /ready, port: 5010 }
        periodSeconds: 5          # PRE_STOP_DELAY_MS should be ~2x this
        failureThreshold: 2
      startupProbe:               # slow first boot must not trip liveness
        httpGet: { path: /health, port: 5010 }
        failureThreshold: 30
        periodSeconds: 2
```

**`terminationGracePeriodSeconds` must be greater than `PRE_STOP_DELAY_MS + SHUTDOWN_TIMEOUT_MS`
(in seconds).** Otherwise Kubernetes kills you in the middle of the drain you carefully wrote.

Run migrations as a separate init container or job — never on app startup. Ten replicas booting
simultaneously would all try to migrate at once.

---

## 11. Splitting into services

The layering rule from [TUTORIAL.md](./TUTORIAL.md#2-how-the-pieces-fit) is what makes this
tractable. `app/services/` is the seam: a service module is already the unit that owns a piece of
business logic and knows nothing about HTTP.

To extract one:

1. **Give it its own database.** Shared tables between services is the mistake that turns
   microservices into a distributed monolith. `DB_NAME` per service.
2. **Turn the local service module into an HTTP client** with `createClient()` — the call sites
   barely change, because they were already calling `notificationService.notifyUserCreated()`
   rather than reaching into a model.
3. **Decide essential vs incidental** for each call ([§6](#6-essential-vs-incidental-calls)).
4. **Set `SERVICE_NAME`** so logs from the two are distinguishable.
5. **Keep the correlation id flowing** — automatic, as long as you use `httpClient`.

A pragmatic order: extract the thing with the fewest inbound dependencies first, and only when
you have a concrete reason (independent scaling, separate release cadence, team boundary). "It
feels cleaner" is not a reason; a distributed system is meaningfully harder to operate than a
modular monolith.

---

## 12. What is still missing

Honest list — these are **not** built:

| Gap | When you'll need it | Suggested |
|---|---|---|
| **Message queue / event bus** | Async work, eventual consistency, fan-out | RabbitMQ, Redis Streams, SQS |
| **Metrics** | Dashboards, alerting, autoscaling on custom metrics | `prom-client` + a `/metrics` endpoint |
| **Distributed tracing spans** | Latency attribution across many hops | OpenTelemetry — correlation IDs already give you log joining, spans give you timing |
| **Service discovery** | Dynamic addressing beyond env vars | Kubernetes DNS, Consul |
| **API versioning** | Breaking changes without breaking callers | Mount `/api/v1` and `/api/v2` route trees |
| **Shared rate-limit store** | Correct limits across instances | `rate-limit-redis` ([§8](#8-rate-limiting)) |
| **Shared session store for non-MySQL** | `APP_MODE=hybrid` on Postgres/Mongo across instances | `connect-pg-simple`, `connect-mongo` |
| **Idempotency keys** | Safe retries on writes | An `Idempotency-Key` header + a dedupe table |
| **Outbox pattern** | Guaranteed publish-after-commit | Transactional outbox table + relay |

None of these are hard to add on top of what's here — the point is that they aren't pretended to
exist.

---

## Quick reference

```bash
curl localhost:5010/health        # liveness  — is the process alive?
curl localhost:5010/ready         # readiness — should traffic route here?
curl -H "X-Request-Id: trace-1" localhost:5010/api/users   # correlate across services
docker build -t my-service . && docker run -p 5010:5010 --env-file .env my-service
```

| File | Responsibility |
|---|---|
| `core/lifecycle.js` | SIGTERM drain, pre-stop delay, force deadline |
| `core/health.js` | `/health` vs `/ready` |
| `core/context.js` | AsyncLocalStorage request context |
| `core/middlewares/requestId.js` | Accept/mint/sanitise the correlation id |
| `core/helpers/httpClient.js` | Timeout, retry, circuit breaker, id propagation |
| `core/middlewares/cors.js` | Origin allowlist, preflight |
| `core/middlewares/rateLimit.js` | Global + auth-specific limiters |
| `app/services/notificationService.js` | Worked example: essential vs incidental calls |
