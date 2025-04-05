export type IssueTokenRequest = {
  target_repositories: string[]
  permissions: {
    [key: string]: 'read' | 'write'
  }
}

export type IssueTokenResponse = {
  token: string
  expires_at: string
  permissions: {
    [key: string]: 'read' | 'write' | 'none'
  }
  repositories: string[]
  issued_by: {
    repository: string
    ref: string
    workflow_ref: string
    run_id: number
  }
}

export type PermissionizerErrorResponse = {
  type: string
  title: string
  status: number
  detail: string
  instance: string
  properties?: {
    request_id?: string
  }
}
