export class ReportAlreadyProcessingError extends Error {
  constructor(reportId: string) {
    super(`This report is already processing (reportId=${reportId}).`)
    this.name = "ReportAlreadyProcessingError"
  }
}

export class ReportUserError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ReportUserError"
    this.status = status
  }
}

export class ReportAgentHttpError extends Error {
  url: string
  status: number
  body: string

  constructor(params: { url: string; status: number; body: string }) {
    const msg = params.body ? `${params.body}` : ""
    super(`Report agent error (${params.status})${msg ? `: ${msg}` : ""}`)
    this.name = "ReportAgentHttpError"
    this.url = params.url
    this.status = params.status
    this.body = params.body
  }
}
