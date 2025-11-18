const DEBUG_PREFIX = "[ReportDebug]"

export const isReportDebugEnabled = process.env.DEBUG_REPORT_GENERATION === "true"

export const debugLog = (...args: unknown[]) => {
  if (!isReportDebugEnabled) return
  console.log(DEBUG_PREFIX, ...args)
}

export const debugWarn = (...args: unknown[]) => {
  if (!isReportDebugEnabled) return
  console.warn(DEBUG_PREFIX, ...args)
}

export const debugError = (...args: unknown[]) => {
  if (!isReportDebugEnabled) return
  console.error(DEBUG_PREFIX, ...args)
}
