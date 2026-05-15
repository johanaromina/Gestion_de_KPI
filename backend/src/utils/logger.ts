const isProd = process.env.NODE_ENV === 'production'

type Level = 'info' | 'warn' | 'error' | 'debug'

const normalizeMeta = (meta: unknown): Record<string, unknown> | undefined => {
  if (meta === undefined || meta === null) return undefined
  if (meta instanceof Error) return { err: meta.message, stack: meta.stack }
  if (typeof meta === 'object') return meta as Record<string, unknown>
  return { value: meta }
}

const log = (level: Level, message: string, meta?: unknown) => {
  const normalized = normalizeMeta(meta)
  if (isProd) {
    process.stdout.write(
      JSON.stringify({ ts: new Date().toISOString(), level, message, ...normalized }) + '\n'
    )
  } else {
    const prefix = { info: '[INFO]', warn: '[WARN]', error: '[ERR ]', debug: '[DBG ]' }[level]
    const metaStr = normalized ? ' ' + JSON.stringify(normalized) : ''
    // eslint-disable-next-line no-console
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
      `${prefix} ${message}${metaStr}`
    )
  }
}

export const logger = {
  info: (msg: string, meta?: unknown) => log('info', msg, meta),
  warn: (msg: string, meta?: unknown) => log('warn', msg, meta),
  error: (msg: string, meta?: unknown) => log('error', msg, meta),
  debug: (msg: string, meta?: unknown) => log('debug', msg, meta),
}
