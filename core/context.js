// Per-request context, carried implicitly through the whole async call stack.
//
// The problem this solves: in a service architecture one user action fans out across several
// services, and you need every log line — from the controller, the model, the outbound HTTP
// call — to carry the same correlation id so the logs can be stitched back together.
//
// The naive fix is to thread `requestId` through every function signature, which poisons every
// API in the codebase for the sake of logging. AsyncLocalStorage keeps the value on the async
// execution context instead, so `getContext()` works anywhere downstream of the middleware
// without anything being passed in.
const { AsyncLocalStorage } = require('node:async_hooks');

const storage = new AsyncLocalStorage();

// Runs `fn` with `context` visible to everything it awaits, transitively.
function runWithContext(context, fn) {
  return storage.run(context, fn);
}

// Returns the active context, or an empty object outside a request (a cron job, a boot-time
// query, a test). Never throws — logging must not become a source of errors.
function getContext() {
  return storage.getStore() || {};
}

function getRequestId() {
  return getContext().requestId;
}

// Adds a field to the current context, e.g. the user id once auth has resolved, so later log
// lines carry it too.
function setContextValue(key, value) {
  const store = storage.getStore();
  if (store) store[key] = value;
}

module.exports = { runWithContext, getContext, getRequestId, setContextValue };
