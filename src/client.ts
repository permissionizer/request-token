import { error, warning } from '@actions/core'
import {
  IssueTokenRequest,
  IssueTokenResponse,
  PermissionizerErrorResponse
} from './types'

interface TypedResponse<T> {
  statusCode: number
  result?: T
}

/**
 * The client for Permissionizer Server and GitHub token revocation.
 */
export class Client {
  private readonly baseUrl: string
  private readonly token: string

  constructor(options: { baseUrl: string; token: string }) {
    this.baseUrl = options.baseUrl
    this.token = options.token
  }

  getToken = async (
    targetRepositories: string[],
    permissions: { [key: string]: 'read' | 'write' }
  ): Promise<IssueTokenResponse> => {
    const requestBody: IssueTokenRequest = {
      target_repositories: targetRepositories,
      permissions
    }

    return this.withRetry(async () => {
      const response = await this.requestJson<IssueTokenResponse>(
        `${this.baseUrl}/v1/token`,
        {
          method: 'POST',
          body: JSON.stringify(requestBody)
        }
      )

      if (response.statusCode >= 400) {
        const message = this.toErrorMessage(response)
        throw new Error(`Failed to get token: ${message}`)
      }
      if (!response.result) {
        throw new Error('Failed to get token: response body is empty')
      }

      return response.result
    })
  }

  revokeToken = async (): Promise<void> => {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/installation/token`, {
        method: 'DELETE',
        headers: this.headers(true),
        signal: AbortSignal.timeout(30000)
      })
    } catch (cause) {
      if (cause instanceof Error) {
        throw cause
      }
      throw new Error(`Error revoking token: ${cause}`, { cause })
    }

    if (!response.ok) {
      throw new Error(
        `Failed to revoke token: Status: ${response.status}, Body: ${await response.text()}`
      )
    }
  }

  private requestJson = async <T>(
    url: string,
    init: RequestInit
  ): Promise<TypedResponse<T>> => {
    let response: Response
    try {
      response = await fetch(url, {
        ...init,
        headers: this.headers(),
        signal: AbortSignal.timeout(30000)
      })
    } catch (cause) {
      throw new Error(`Error fetching token: ${cause}`, { cause })
    }

    const body = await response.text()
    if (!body) {
      return { statusCode: response.status }
    }

    try {
      return { statusCode: response.status, result: JSON.parse(body) as T }
    } catch {
      return { statusCode: response.status, result: body as T }
    }
  }

  /**
   * Formats errors returned by Permissionizer Server.
   */
  private toErrorMessage = (response: TypedResponse<unknown>): string => {
    const errorBody = response.result
    if (!errorBody) {
      return `Status: ${response.statusCode}, Body: [no error body]`
    }
    if (
      typeof errorBody === 'object' &&
      'detail' in errorBody &&
      errorBody.detail !== undefined
    ) {
      const permissionizerErrorResponse =
        errorBody as PermissionizerErrorResponse
      return `Status: ${response.statusCode}, Error: ${permissionizerErrorResponse.detail}. Request ID: ${permissionizerErrorResponse.properties?.request_id}`
    }
    return `Status: ${response.statusCode}, Body: ${String(errorBody)}`
  }

  private headers = (githubApi: boolean = false): Record<string, string> => {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'permissionizer/request-token@v1'
    }
    return githubApi
      ? { ...headers, 'X-GitHub-Api-Version': '2022-11-28' }
      : headers
  }

  /**
   * Retries transient request failures.
   */
  private withRetry = async <T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 500
  ): Promise<T> => {
    let attempt = 0
    while (attempt < retries) {
      try {
        return await fn()
      } catch (requestError) {
        attempt++
        warning(`Retry attempt ${attempt} failed: ${requestError}`)
        if (attempt >= retries) {
          error(`All ${retries} retry attempts failed.`)
          throw requestError
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    throw new Error('Retry attempts exceeded')
  }
}
