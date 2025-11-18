import axios from "axios"
import type { AxiosInstance } from "axios"
import { DIFY_CONFIG } from "@/lib/constants"
import { debugError, debugLog } from "@/lib/utils/debug"

export type DifyWorkflowInput = Record<string, unknown>

export type DifyWorkflowFiles = Record<string, unknown>

export type DifyWorkflowResponse = {
  id: string
  status: string
  output?: Record<string, unknown>
  elapsed_time?: number
  error?: string
}

export class DifyClient {
  private client: AxiosInstance

  constructor() {
    const baseURL = process.env.DIFY_API_URL
    const apiKey = process.env.DIFY_API_KEY

    if (!baseURL || !apiKey) {
      throw new Error("Missing DIFY_API_URL or DIFY_API_KEY environment variables.")
    }

    this.client = axios.create({
      baseURL,
      timeout: DIFY_CONFIG.TIMEOUT,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    })

    debugLog("Initialized DifyClient", { baseURL, timeout: DIFY_CONFIG.TIMEOUT })
  }

  async runWorkflow(
    inputs: DifyWorkflowInput,
    options?: { userId?: string; files?: DifyWorkflowFiles }
  ): Promise<DifyWorkflowResponse> {
    const payload: { inputs: DifyWorkflowInput; files?: DifyWorkflowFiles; user?: string } = {
      inputs,
    }

    if (options?.userId) {
      payload.user = options.userId
    }

    if (options?.files) {
      payload.files = options.files
    }

    let attempt = 0
    while (attempt < DIFY_CONFIG.MAX_RETRIES) {
      try {
        debugLog("Calling Dify API", { attempt: attempt + 1, payload })
        const response = await this.client.post<DifyWorkflowResponse>("/v1/workflows/run", payload)
        debugLog("Dify API response", {
          attempt: attempt + 1,
          status: response.data.status,
          id: response.data.id,
          keys: response.data.output ? Object.keys(response.data.output) : [],
        })
        return response.data
      } catch (error) {
        attempt += 1
        if (attempt >= DIFY_CONFIG.MAX_RETRIES) {
          if (axios.isAxiosError(error)) {
            const message = error.response?.data ?? error.message
            debugError("Dify API request failed", message)
            throw new Error(`Dify API error: ${JSON.stringify(message)}`)
          }
          debugError("Dify API request failed", error)
          throw error
        }
        debugError("Dify API request error, retrying", error)
        await new Promise((resolve) => setTimeout(resolve, DIFY_CONFIG.RETRY_DELAY))
      }
    }

    throw new Error("Dify workflow failed after maximum retries.")
  }
}

export const getDifyClient = () => new DifyClient()
