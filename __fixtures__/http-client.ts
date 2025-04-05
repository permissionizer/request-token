import { jest } from '@jest/globals'
import { HttpClient as target } from '@actions/http-client'

export const postJson = jest.fn<typeof target.prototype.postJson>()

export class HttpClient {
  postJson = postJson
}
