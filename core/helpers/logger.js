const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');
const { getContext } = require('../context');

const logDir = path.join(__dirname, '..', '..', 'storage', 'logs');

// Stamps every log line with the current request's correlation id, pulled from
// AsyncLocalStorage. Nothing at the call site changes — `logger.info('saved')` inside a model,
// three awaits deep, still comes out tagged with the request that triggered it. That's what
// makes logs joinable across services.
const withContext = winston.format((info) => {
  const { requestId, userId } = getContext();
  if (requestId) info.requestId = requestId;
  if (userId) info.userId = userId;
  return info;
});

const SERVICE_NAME = process.env.SERVICE_NAME || process.env.APP_NAME || 'forge-mvc';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  // `service` lets a shared log aggregator tell which service a line came from once you're
  // running more than one.
  defaultMeta: { service: SERVICE_NAME },
  format: winston.format.combine(
    withContext(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logDir, 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
    new winston.transports.Console({
      // In production, emit JSON on stdout too — that's what container log collectors read.
      // Pretty-print only for a human at a terminal.
      format:
        process.env.NODE_ENV === 'production'
          ? winston.format.json()
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.printf(({ level, message, timestamp, requestId }) =>
                `${timestamp} ${level}: ${requestId ? `[${requestId.slice(0, 8)}] ` : ''}${message}`
              )
            ),
    }),
  ],
});

module.exports = logger;
