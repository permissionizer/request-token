import * as core from '@actions/core'
import { Client } from './client'

const PERMISSIONIZER_SERVER = 'https://permissionizer.app'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    return await main()
  } catch (e) {
    // Fail the workflow run if an error occurs
    if (e instanceof Error) {
      core.setFailed(e.message)
    }
  }
}

const main = async () => {
  if (!process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throw new Error(
      `Environment variable 'ACTIONS_ID_TOKEN_REQUEST_URL' is not set. Make sure that the action is running with 'id-token: write' permission.`
    )
  }
  const targetRepositories = parseRepositories(
    core.getInput('target-repository', {
      required: true,
      trimWhitespace: true
    })
  )
  if (targetRepositories.length === 0) {
    throw new Error(
      "'target-repository' must be set and contain at least one repository"
    )
  }
  const permissions = parsePermissions(
    core.getInput('permissions', { required: true, trimWhitespace: true })
  )
  if (Object.entries(permissions).length === 0) {
    throw new Error(
      "'permissions' must be set and contain at least a single permission"
    )
  }
  const permissionizerServer =
    core.getInput('permissionizer-server', {
      required: false,
      trimWhitespace: true
    }) || PERMISSIONIZER_SERVER
  if (!permissionizerServer.startsWith('http')) {
    throw new Error(
      `Invalid permissionizer-server URL: ${permissionizerServer}. Must start with 'http' or 'https'.`
    )
  }

  core.info('Issuing ID Token from GitHub API')
  const idToken = await core.getIDToken(
    `permissionizer-server (${permissionizerServer})`
  )

  // make sure that the idToken is always masked if accidentally logged
  core.setSecret(idToken)

  core.info(`Requesting a scoped token from ${permissionizerServer}`)
  const client = new Client({ baseUrl: permissionizerServer, idToken })
  const response = await client.getToken(targetRepositories, permissions)

  core.setSecret(response.token)

  core.setOutput('token', response.token)
  core.setOutput('issued-by', response.issued_by)
  core.setOutput('expires-at', response.expires_at)
  core.setOutput('repositories', response.repositories)
  core.setOutput('permissions', response.permissions)

  core.info(
    `Token was successfully requested and was set as an output 'token'. Expires at: ${response.expires_at}`
  )
}

/**
 * Parses repositories in format of multiline or comma-separated string, or a JSON array input
 * Examples:
 * - repositories: owner/repo1, owner/repo2
 * - repositories: |
 *    owner/repo1
 *    owner/repo2
 * - repositories: ["owner/repo1", "owner/repo2"]
 */
const parseRepositories = (input: string): string[] => {
  let isJson = false
  try {
    const json = JSON.parse(input)
    isJson = true
    if (Array.isArray(json)) {
      return json
        .map((item) => {
          if (typeof item !== 'string') {
            throw new Error(
              'Input is a JSON array, but contains non-string values'
            )
          }
          return item.trim()
        })
        .filter((item) => item !== '')
        .map((item) => validateRepository(item))
    } else if (typeof json === 'string') {
      return [validateRepository(json)]
    } else {
      throw new Error(
        'Input is a JSON, but is not supported: requires array of strings or string'
      )
    }
  } catch (e) {
    if (isJson) {
      throw e
    }
    return input
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter((item) => item !== '')
      .map((item) => validateRepository(item))
  }
}

/**
 * Validates that supplied repository is in the format of 'owner/repo'
 */
const validateRepository = (repository: string) => {
  const regex = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
  if (!regex.test(repository)) {
    throw new Error(
      `Invalid repository format: ${repository}. Must be in the format 'owner/repo'.`
    )
  }
  return repository
}

function addPermission(
  permissions: { [key: string]: 'read' | 'write' },
  permission: string,
  access: unknown
) {
  if (typeof access !== 'string') {
    throw new Error(
      `Invalid access for ${permission}: ${access}. Must be one of 'read', 'write'.`
    )
  }
  permissions[permission.trim()] = validateAccess(
    permission.trim(),
    access.trim()
  )
}

/**
 * Parses permissions in format of multiline or comma-separated string, or a JSON object input
 * Examples:
 * - permissions: contents: read, issues: write
 * - permissions: contents=read,issues=write
 * - permissions: |
 *     contents: read
 *     issues: write
 * - permissions: |
 *     contents=read
 *     issues=write
 * - permissions: { "contents": "read", "issues": "write" }
 */
const parsePermissions = (
  input: string
): { [key: string]: 'read' | 'write' } => {
  const permissions = {} as { [key: string]: 'read' | 'write' }
  let isJson = false
  try {
    const json = JSON.parse(input)
    isJson = true
    if (typeof json !== 'object' || Array.isArray(json)) {
      throw new Error(
        'Input is a JSON, but is not supported: requires an object with permission to access'
      )
    }
    Object.entries(json).forEach(([permission, access]) =>
      addPermission(permissions, permission, access)
    )
  } catch (e) {
    if (isJson) {
      throw e
    }
    input
      .split(/[\n,]+/)
      .filter((item) => item.trim() !== '')
      .forEach((item) => {
        const [permission, access] = item.split(/[:=]/, 2)
        addPermission(permissions, permission, access)
      })
  }
  return permissions
}

/**
 * Validates that permissions access can only be 'read' or 'write'. While 'none' is a valid access level and can be
 * returned in the response, it makes no sense to "request" it.
 */
const validateAccess = (
  permission: string,
  access: string
): 'read' | 'write' => {
  if (access !== 'read' && access !== 'write') {
    throw new Error(
      `Invalid access for ${permission}: ${access}. Must be one of 'read', 'write'.`
    )
  }
  return access
}
