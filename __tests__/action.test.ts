import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

jest.unstable_mockModule('@actions/core', () => core)

const fetchMock = jest.fn<typeof fetch>()
global.fetch = fetchMock

const inputs = {
  'target-repository': jest.fn<string>(),
  permissions: jest.fn<string>(),
  'permissionizer-server': jest.fn<string>(),
  'revoke-token': jest.fn<string>()
}

const tokenResponse = {
  token: 'test-token',
  expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  permissions: {
    metadata: 'read',
    contents: 'read',
    issues: 'write'
  },
  repositories: ['owner/repo1', 'owner/repo2'],
  issued_by: {
    repository: 'owner/repo1',
    ref: 'refs/heads/main',
    workflow_ref: 'owner/repo1/.github/workflows/ci.yaml@refs/heads/main',
    run_id: 123456789
  }
}

const expectTokenRequest = (url: string, body: unknown) => {
  expect(fetchMock).toHaveBeenCalledWith(
    url,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(body)
    })
  )
}

const { main, post } = await import('../src/action.js')

describe('main.ts', () => {
  beforeEach(() => {
    inputs['target-repository'].mockImplementation(
      () => 'owner/repo1, owner/repo2'
    )
    inputs['permissions'].mockImplementation(
      () => 'contents: read, issues: write'
    )
    inputs['permissionizer-server'].mockImplementation(
      () => 'https://permissionizer.app'
    )
    inputs['revoke-token'].mockImplementation(() => 'true')

    core.getIDToken.mockImplementation(() => 'test-id-token')

    core.getInput.mockImplementation((name) => {
      if (inputs[name]) {
        return inputs[name]()
      }
      return null
    })

    const state = {}
    core.saveState.mockImplementation((key, value) => (state[key] = value))
    core.getState.mockImplementation((key) => state[key])

    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return new Response(JSON.stringify(tokenResponse), { status: 200 })
    })

    process.env.ACTIONS_ID_TOKEN_REQUEST_URL = 'https://github.com'
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('Issues a token', async () => {
    await main()

    expect(core.setFailed).not.toHaveBeenCalled()

    expectTokenRequest('https://permissionizer.app/v1/token', {
      target_repositories: ['owner/repo1', 'owner/repo2'],
      permissions: {
        contents: 'read',
        issues: 'write'
      }
    })

    expect(core.setSecret).toHaveBeenCalledWith('test-token')
    expect(core.setOutput).toHaveBeenCalledWith('token', 'test-token')
    expect(core.setOutput).toHaveBeenCalledWith('issued-by', {
      repository: 'owner/repo1',
      ref: 'refs/heads/main',
      workflow_ref: 'owner/repo1/.github/workflows/ci.yaml@refs/heads/main',
      run_id: 123456789
    })
    expect(core.setOutput).toHaveBeenCalledWith('expires-at', expect.anything())
    expect(core.setOutput).toHaveBeenCalledWith('repositories', [
      'owner/repo1',
      'owner/repo2'
    ])
    expect(core.setOutput).toHaveBeenCalledWith('permissions', {
      metadata: 'read',
      contents: 'read',
      issues: 'write'
    })
    expect(core.saveState).toHaveBeenCalledWith('token', 'test-token')
  })

  it('Fails if ACTIONS_ID_TOKEN_REQUEST_URL is not set', async () => {
    delete process.env.ACTIONS_ID_TOKEN_REQUEST_URL

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Environment variable 'ACTIONS_ID_TOKEN_REQUEST_URL' is not set. Make sure that the action is running with 'id-token: write' permission."
    )
  })

  it('Accepts target-repository in multi-line format', async () => {
    inputs['target-repository'].mockImplementation(
      () => `
        owner/repo1
        owner/repo2
    `
    )

    await main()

    expect(core.setFailed).not.toHaveBeenCalled()

    expectTokenRequest('https://permissionizer.app/v1/token', {
      target_repositories: ['owner/repo1', 'owner/repo2'],
      permissions: {
        contents: 'read',
        issues: 'write'
      }
    })
  })

  it('Accepts target-repository in JSON format', async () => {
    inputs['target-repository'].mockImplementation(
      () => '["owner/repo1","owner/repo2"]'
    )

    await main()

    expect(core.setFailed).not.toHaveBeenCalled()

    expectTokenRequest('https://permissionizer.app/v1/token', {
      target_repositories: ['owner/repo1', 'owner/repo2'],
      permissions: {
        contents: 'read',
        issues: 'write'
      }
    })
  })

  it('Accepts target-repository in JSON string', async () => {
    inputs['target-repository'].mockImplementation(() => '"owner/repo1"')

    await main()

    expect(core.setFailed).not.toHaveBeenCalled()

    expectTokenRequest('https://permissionizer.app/v1/token', {
      target_repositories: ['owner/repo1'],
      permissions: {
        contents: 'read',
        issues: 'write'
      }
    })
  })

  it('Fails if target-repository is empty', async () => {
    inputs['target-repository'].mockImplementationOnce(() => '')

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "'target-repository' must be set and contain at least one repository"
    )
  })

  it('Fails if target-repository is invalid JSON', async () => {
    inputs['target-repository'].mockImplementationOnce(
      () => '{"repository": "owner/repo1"}'
    )

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Input is a JSON, but is not supported: requires array of strings or string'
    )
  })

  it('Fails if target-repository is invalid format', async () => {
    inputs['target-repository'].mockImplementationOnce(
      () => 'repository-without-org'
    )

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Invalid repository format: repository-without-org. Must be in the format 'owner/repo'."
    )
  })

  it('Accepts permissions in multi-line format', async () => {
    inputs['permissions'].mockImplementation(
      () => `
        actions: read
        contents : read
        issues = write
        pull-requests=read
    `
    )
    await main()

    expect(core.setFailed).not.toHaveBeenCalled()

    expectTokenRequest('https://permissionizer.app/v1/token', {
      target_repositories: ['owner/repo1', 'owner/repo2'],
      permissions: {
        actions: 'read',
        contents: 'read',
        issues: 'write',
        'pull-requests': 'read'
      }
    })
  })

  it('Accepts permissions in JSON format', async () => {
    inputs['permissions'].mockImplementation(
      () => `
      {
        "actions": "read",
        "contents": "read",
        "issues": "write",
        "pull-requests": "read"
      }
    `
    )
    await main()

    expect(core.setFailed).not.toHaveBeenCalled()

    expectTokenRequest('https://permissionizer.app/v1/token', {
      target_repositories: ['owner/repo1', 'owner/repo2'],
      permissions: {
        actions: 'read',
        contents: 'read',
        issues: 'write',
        'pull-requests': 'read'
      }
    })
  })

  it('Fails if permissions is empty', async () => {
    inputs['permissions'].mockImplementationOnce(() => '')

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "'permissions' must be set and contain at least a single permission"
    )
  })

  it('Fails if permissions JSON is array', async () => {
    inputs['permissions'].mockImplementation(
      () => `
      [{"actions": "read"}]
    `
    )

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      'Input is a JSON, but is not supported: requires an object with permission to access'
    )
  })

  it('Fails if permissions JSON is invalid', async () => {
    inputs['permissions'].mockImplementation(
      () => `
      {"actions": {}}
    `
    )

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Invalid access for actions: [object Object]. Must be one of 'read', 'write'."
    )
  })

  it('Fails if permissions are invalid', async () => {
    inputs['permissions'].mockImplementation(
      () => `
      {"actions": "hello"}
    `
    )

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Invalid access for actions: hello. Must be one of 'read', 'write'."
    )
  })

  it('Failed if permissionizer-server URL is invalid', async () => {
    inputs['permissionizer-server'].mockImplementation(
      () => 'tcp://invalid-url'
    )

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Invalid permissionizer-server URL: tcp://invalid-url. Must start with 'http' or 'https'."
    )
  })

  it('Uses default permissionizer-server URL if empty', async () => {
    await main()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://permissionizer.app/v1/token',
      expect.anything()
    )
  })

  it('Uses custom permissionizer-server URL if passed', async () => {
    inputs['permissionizer-server'].mockImplementation(
      () => 'https://custom-permissionizer.com'
    )
    await main()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://custom-permissionizer.com/v1/token',
      expect.anything()
    )
  })

  it('Propagates error from Permissionizer Server', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            detail:
              "The target repository 'owner/repo1' does not allow 'owner/requestor' to access it. Please reach out to the repository owner to allow access",
            properties: {
              request_id: '123'
            }
          }),
          { status: 403 }
        )
    )

    await main()

    expect(core.setFailed).toHaveBeenCalledWith(
      "Failed to get token: Status: 403, Error: The target repository 'owner/repo1' does not allow 'owner/requestor' to access it. Please reach out to the repository owner to allow access. Request ID: 123"
    )
  })

  it('Revokes token in post', async () => {
    await main()
    await post()

    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.github.com/installation/token',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('Does not save state if token does not need to be revoked', async () => {
    inputs['revoke-token'].mockImplementation(() => 'false')

    await main()
    await post()

    expect(core.setOutput).toHaveBeenCalledWith('token', 'test-token')
    expect(core.saveState).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Propagates error from token revocation', async () => {
    await main()
    fetchMock.mockRejectedValueOnce(new Error("Can't revoke token"))
    await post()

    expect(core.warning).toHaveBeenCalledWith(
      "Error while revoking token: Can't revoke token"
    )
  })
})
