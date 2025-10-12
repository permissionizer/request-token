# Permissionizer / Request Token action

[![GitHub Super-Linter](https://github.com/permissionizer/request-token/actions/workflows/linter.yaml/badge.svg)](https://github.com/super-linter/super-linter)
[![Build](https://github.com/permissionizer/request-token/actions/workflows/build.yaml/badge.svg)](https://github.com/permissionizer/request-token/actions/workflows/build.yaml)
[![Check dist](https://github.com/permissionizer/request-token/actions/workflows/check-dist.yaml/badge.svg)](https://github.com/permissionizer/request-token/workflows/check-dist.yaml)
[![CodeQL](https://github.com/permissionizer/request-token/actions/workflows/codeql-analysis.yaml/badge.svg)](https://github.com/permissionizer/request-token/workflows/codeql-analysis.yaml)
[![Coverage](./badges/coverage.svg)](https://github.com/permissionizer/request-token/actions/workflows/build.yaml)

This action requests a temporary token from the
[Permissionizer App](https://github.com/apps/permissionizer).  
The token can be used in places where
[`GITHUB_TOKEN`](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication)
or a
[Personal Access Token (PAT)](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)
would normally be used to perform actions on a different repository.

The [Permissionizer App](https://github.com/apps/permissionizer) must be
installed in the _target repository_, which must define a policy allowing access
from the repository requesting the token (see
[Zero Trust Policy](#zero-trust-policy)).

## Inputs

| Name                    | Required | Description                                                                                                                                                                                                                                                                                    |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-repository`     | required | The repository (or repositories) for which the token is to be requested, in the format `owner/repo`. Multiple values can be provided, separated by commas or newlines.                                                                                                                         |
| `permissions`           | required | The permissions that should be assigned to the token when it is issued. For available scopes and details, refer to the [GitHub documentation](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token). |
| `permissionizer-server` | optional | URL of [server](https://github.com/permissionizer/server) for self-hosted deployments. Default: `https://permissionizer.app` (free cloud version, subject to the rate limit of 10 tokens per minute)                                                                                           |

## Usage

### Requesting a token to perform actions on a different repository

Before requesting a token, a repository must install
[Permissionizer App](https://github.com/apps/permissionizer) and declare a
policy that allows the access to one or multiple repositories. The policy is
declared in the `.github/permissionizer.yaml` file in the root of your
repository, for example:

```yaml
self: permissionizer/server
allow:
  - repository: permissionizer/request-token
    permissions:
      contents: read
      issues: write
```

After a policy is defined, the requesting repository
`permissionizer/request-token` can request the token from a GitHub Actions
workflow. Only permissions allowed in the policy can be requested.

```yaml
permissions:
  id-token: write # required for issuing GitHub OIDC tokens for identity verification
steps:
  - id: request-token
    uses: permissionizer/request-token@v1
    with:
      target-repository: permissionizer/server
      # see all available permissions
      # https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#permissions-for-the-github_token
      permissions: |
        contents: read
        issues: write
```

with this token, the workflow can now clone the `permissionizer/server`
repository and create an issue in it.

```yaml
- uses: actions/checkout@v4
  with:
    repository: permissionizer/server
    token: ${{ steps.request-token.outputs.token }}

- name: Create new issue in permissionizer/server
  uses: actions/github-script@v7
  with:
    github-token: ${{ steps.request-token.outputs.token }}
    script: |
      await github.rest.issues.create({
          owner: 'permissionizer',
          repo: 'server',
          title: 'Cross-repository automation with permissionizer/request-token',
          body: `🚀 This issue was created by `permissionizer/request-token` — showing just how simple secure cross-repo workflows can be!`
        });
```

### Triggering workflows _within_ the same repository

By default, any task performed using
[`GITHUB_TOKEN`](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#using-the-github_token-in-a-workflow)
will **not trigger most workflows**, including those with `push` or
`pull_request` triggers.  
This is a GitHub restriction designed to prevent infinite automation loops.

However, by requesting a token via the
[Permissionizer App](https://github.com/apps/permissionizer), you can **bypass
this limitation even within the same repository** — securely and with explicit
policy control.

This is especially useful for actions that make automated commits or pull
requests and expect follow-up workflows to run:

- [Git Auto Commit](https://github.com/marketplace/actions/git-auto-commit)
- [Dependabot Auto Merge](https://github.com/marketplace/actions/dependabot-auto-merge)
- [GitHub Activity in readme](https://github.com/marketplace/actions/github-activity-readme)
- [Auto Update](https://github.com/marketplace/actions/auto-update)
- [GitHub Prettier Action](https://github.com/marketplace/actions/prettier-action)
- [Super-Linter](https://github.com/marketplace/actions/super-linter)
- [GitHub Actions Version Updater](https://github.com/marketplace/actions/github-actions-version-updater)
- [Homebrew bump formula](https://github.com/marketplace/actions/homebrew-bump-formula)
- [Update Gradle Wrapper Action](https://github.com/marketplace/actions/update-gradle-wrapper-action)
- [GitHub cherry pick action](https://github.com/marketplace/actions/github-cherry-pick-action)

or any other action that relies on `push` events to trigger downstream workflows
after making changes.

To enable this behavior, simply request a token for the **current repository**
by setting `target-repository: ${{ github.repository }}`.  
Even in this case, the target repository must define a policy with explicitly
allowed permissions — ensuring **secure** access without unintended privilege escalation.

Policy example:

```yaml
self: permissionizer/request-token
allow:
  - repository: permissionizer/request-token
    permissions:
      contents: read
      pull-requests: write
```

Workflow:

```yaml
jobs:
  update-gradle-wrapper:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4

      - id: request-token
        uses: permissionizer/request-token@v1
        with:
          target-repository: ${{ github.repository }}
          permissions: |
            contents: read
            pull-requests: write

      - uses: gradle-update/update-gradle-wrapper-action@v2
        with:
          repo-token: ${{ steps.request-token.outputs.token }}
          labels: dependencies
```

### Requesting a single token for multiple repositories

When requesting a token for multiple repositories, they must belong to the same
organization and every repositories must declare a policy allowing all the
requested permissions.

For example:

```yaml
steps:
  - id: request-token
    uses: permissionizer/request-token@v1
    with:
      target-repository: |
        permissionizer/server
        permissionizer/request-token
      permissions: |
        contents: read
        issues: write
```

requires the following policy in both `permissionizer/server` and
`permissionizer/request-token`:

```yaml
# .github/permissionizer.yaml in permissionizer/server
self: permissionizer/server
allow:
  - repository: permissionizer/server
    permissions:
      contents: read
      issues: write
```

```yaml
# .github/permissionizer.yaml in permissionizer/request-token
self: permissionizer/request-token
allow:
  - repository: permissionizer/server
    permissions:
      contents: read
      issues: write
```

## Live Demo

This repository includes a live [demo workflow](.github/workflows/demo.yaml)
showcasing how to use the `permissionizer/request-token@v1` action. The workflow
runs continuously and requests a short-lived token to updates the
[permissionizer/server#1](https://github.com/permissionizer/server/issues/1)
issue.

The demo works because the
[permissionizer/server](https://github.com/permissionizer/server/blob/main/.github/permissionizer.yaml)
repository defines a policy that explicitly allows
`permissionizer/request-token` to request a token with `contents: read` and
`issues: write` permissions.

## Zero Trust Policy

After installing [Permissionizer App](https://github.com/apps/permissionizer)
into your repository, you need to define a policy that allows the access from
the repository requesting the token. The policy is defined in the
`.github/permissionizer.yaml` file in the root of your repository.

Here is an example policy that allows access to the
`permissionizer/request-token` repository:

```yaml
# Current repository to make sure the policy isn't automatically applied to forks
self: permissionizer/request-token
allow:
  # (required)
  # Repository requesting the token
  # Supports wildcards, e.g. `permissionizer/*` to allow all repositories in the `permissionizer` organization
  - repository: permissionizer/server
    # (required)
    # Permissions that can be requested by 'permissionizer/server'
    # Only permissions listed here are allowed to be requested, except 'metadata: read', which is added
    # automatically if any other permission is defined.
    # Requestor can always request less permissions or lower access than allowed
    # (i.e. requesting only `issues: read` when allowed `contents: write`, `issues: write`)
    permissions:
      contents: read
      issues: write
    # (optional)
    # Restricts requesting token to specific branches of the requesting repository
    # Uses GitHub format of `ref` (e.g. `refs/heads/main`, `refs/tags/v1.0.0`, `refs/tags/v*`) 
    # or short branch or tag name (e.g. `main`, `v1.0.0`, `v*`)
    ref: refs/heads/main
    # (optional)
    # Restricts requesting token only from a specific workflow of the requesting repository
    # Uses GitHub format of `workflow_ref` (e.g. `.github/workflows/release.yaml`)
    # allows specifying a repository and a branch (e.g. `permissionizer/server/.github/workflows/reusable-workflow.yaml@refs/heads/main`)
    workflow_ref: .github/workflows/release.yaml
```

following this policy, only the `permissionizer/server` repository can request a
token with access to the `permissionizer/request-token` repository. This token
will only have `contents: read`, `issues: write` and `metadata: read` (added
automatically) permissions.

To harden the security, the token can only be requested from the `main` branch,
making sure that the repository cannot be accessed from the unreviewed branches
or Pull Requests. Additionally, the token can only be requested from the
`release.yaml` workflow, making sure that the token cannot be requested from any
other workflow.

### Access policy evaluation

Multiple policies can be defined in the `.github/permissionizer.yaml` file,
including multiple policies for the same repository. The policies are evaluated
in the order they are defined, returning the token with permissions of the first
allowed policy.

For example:

```yaml
self: permissionizer/request-token
allow:
  - repository: permissionizer/server
    permissions:
      contents: read
  - repository: permissionizer/server
    permissions:
      contents: write
    ref: refs/heads/main
```

the requesting repository can request a token with `contents: read` from any
branch, but can only request a token with `contents: write` from the `main`
branch.

## Permissionizer

The [**Permissionizer App**](https://github.com/apps/permissionizer) is a GitHub
App that securely issues short-lived, policy-based tokens as an
[OIDC provider](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect).
These tokens enable secure cross-repository automation by allowing workflows to
perform actions on other repositories, strictly adhering to defined policies.

Unlike
[actions/create-github-app-token](https://github.com/marketplace/actions/create-github-app-token),
the Permissionizer App eliminates the need to create and manage custom GitHub
Apps or share private keys. It can be installed in any repository or
organization, with token issuance handled by the
[Permissionizer Server](https://github.com/permissionizer/server), which is
available for free (with some basic rate limiting).

Tokens are only issued if explicitly allowed by the target repository's policy,
ensuring strict access control. The requesting workflow must provide an ID token
(requires `id-token: write` permission), which is verified by the Permissionizer
Server. The process is seamlessly managed by the
`permissionizer/request-token@v1` action.

### Custom Deployment

While the process of issuing tokens is secure and requires explicit policies for
the token exchange, to maintain full control over token exchange and deployment,
organizations can create a custom Permissionizer App (public or internal) and
deploy an instance of the Permissionizer Server. This ensures that no tokens
ever leave the organization's internal network.

To deploy a custom instance of the Permissionizer Server, follow these steps:

1. **Create a GitHub App**

   Set up a GitHub App with the required permissions and install it into the
   desired repository or organization. The only required permission is
   `contents: read`, that ensures the server can read the
   `.github/permissionizer.yaml` policy file in the target repository, all other
   permissions are optional and depend on which permissions you might need to
   request for cross-repository automations.

2. **Configure the Server**

   Add the GitHub App details to the `config/permissionizer-server.yaml` file or
   use environment variables (refer to `config/.env` for supported variables).

3. **Run the Server**

   Use the official Docker image `ghcr.io/permissionizer/server:latest` to
   deploy the server. Mount the configuration file or pass the required
   environment variables.

4. **Integrate with `permissionizer/request-token`**

   When using the `permissionizer/request-token` action, specify the custom
   server URL in the `permissionizer-server` input:

   ```yaml
   - id: request-token
     uses: permissionizer/request-token@v1
     with:
       permissionizer-server: https://permissionizer.mycompany.com
       target-repository: permissionizer/server
       permissions: |
         contents: read
         issues: write
   ```
