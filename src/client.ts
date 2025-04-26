import * as core from '@actions/core'
import { HttpClient } from '@actions/http-client'
import {
  IssueTokenRequest,
  IssueTokenResponse,
  PermissionizerErrorResponse
} from './types'
import * as ifm from '@actions/http-client/lib/interfaces.js'
import { BearerCredentialHandler } from '@actions/http-client/lib/auth'

/**
 * The client for permissionizer server, requests scoped GitHub token using IDToken.
 */
export class Client {
  private readonly baseUrl: string
  private readonly idToken: string
  private readonly httpClient: HttpClient

  constructor(options: { baseUrl: string; idToken: string }) {
    this.baseUrl = options.baseUrl
    this.idToken = options.idToken
    this.httpClient = new HttpClient(
      'permissionizer/request-token@v1',
      [new BearerCredentialHandler(this.idToken)],
      {
        allowRedirects: true,
        maxRedirects: 3,
        socketTimeout: 30000,
        allowRetries: true,
        maxRetries: 3,
        keepAlive: true,
        headers: {
          Accept: 'application/json'
        }
      }
    )
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
      let response
      try {
        response = await this.httpClient.postJson(
          `${this.baseUrl}/v1/token`,
          requestBody
        )
      } catch (e) {
        throw new Error(`Error fetching token: ${e}`)
      }

      if (response.statusCode && response.statusCode >= 400) {
        const error = await this.toErrorMessage(response)
        throw new Error(`Failed to get token: ${error}`)
      }

      return response.result as IssueTokenResponse
    })
  }

  /**
   * Reads the error message from the response, if a response was returned by permissionizer-server it will include the
   * error message and Request ID.
   */
  toErrorMessage = async (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: ifm.TypedResponse<any>
  ) => {
    let errorBody
    try {
      errorBody = response.result
      if (!errorBody) {
        return `Status: ${response.statusCode}, Body: [no error body]`
      }
      if (errorBody['detail'] !== undefined) {
        const permissionizerErrorResponse =
          errorBody as PermissionizerErrorResponse
        return `Status: ${response.statusCode}, Error: ${permissionizerErrorResponse.detail}. Request ID: ${permissionizerErrorResponse.properties?.request_id}`
      }
      return `Status: ${response.statusCode}, Body: ${errorBody}`
    } catch (e) {
      if (errorBody) {
        return `Status: ${response.statusCode}, Body: ${errorBody}`
      }
      return `Status: ${response.statusCode}, Error: ${e}`
    }
  }

  /**
   * Generic retry mechanism.
   *
   * @param fn - The function to retry.
   * @param retries - The number of retry attempts.
   * @param delay - The delay between retries in milliseconds.
   * @returns The result of the function if successful.
   * @throws An error if all retry attempts fail.
   */
  withRetry = async <T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delay: number = 500
  ): Promise<T> => {
    let attempt = 0
    while (attempt < retries) {
      try {
        return await fn()
      } catch (error) {
        attempt++
        core.warning(`Retry attempt ${attempt} failed: ${error}`)
        if (attempt >= retries) {
          core.error(`All ${retries} retry attempts failed.`)
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    // This line is unreachable, but TypeScript needs it to be sure that the function always returns a value or throws an error.
    throw new Error('Retry attempts exceeded')
  }
}
