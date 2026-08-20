/**
 * Structured Logger
 *
 * Replaces console.log/error/warn with structured JSON output.
 * In production, pipe to a log aggregator (Datadog, Loki, etc.).
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const ENV = process.env.NODE_ENV || 'development';
const MIN_LEVEL: LogLevel = ENV === 'production' ? 'info' : 'debug';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  [key: string]: any;
}

function format(entry: LogEntry): string {
  if (ENV === 'production') {
    return JSON.stringify(entry);
  }
  // Pretty format for development
  const color = {
    error: '\x1b[31m', // red
    warn: '\x1b[33m',  // yellow
    info: '\x1b[36m',  // cyan
    debug: '\x1b[90m', // gray
  }[entry.level];
  const reset = '\x1b[0m';
  const meta = Object.entries(entry)
    .filter(([k]) => !['level', 'timestamp', 'message'].includes(k))
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ');
  return `${color}[${entry.timestamp}] ${entry.level.padEnd(5)}${reset} ${entry.message}${meta ? ' ' + meta : ''}`;
}

function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  if (LOG_LEVELS[level] > LOG_LEVELS[MIN_LEVEL]) return;
  
  const entry: LogEntry = {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...meta,
  };
  
  const formatted = format(entry);
  
  if (level === 'error') {
    process.stderr.write(formatted + '\n');
  } else {
    process.stdout.write(formatted + '\n');
  }
}

export const logger = {
  error: (message: string, meta?: Record<string, any>) => log('error', message, meta),
  warn: (message: string, meta?: Record<string, any>) => log('warn', message, meta),
  info: (message: string, meta?: Record<string, any>) => log('info', message, meta),
  debug: (message: string, meta?: Record<string, any>) => log('debug', message, meta),
};

// Re-export for use in server code
export default logger;
