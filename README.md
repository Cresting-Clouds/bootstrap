# Cresting Clouds Bootstrap

Public GitHub Action used by the Cresting Clouds customer workflow.

The action accepts one Nimbus-signed reference and fails closed unless its
signature, key identifier, audience, lifetime, and purpose are valid. Depending
on that signed purpose it either publishes an encrypted, short-lived
authorization grant or redeems a GitHub OIDC identity for a temporary runtime
package.

Authorization grants are staged as one temporary `grant.json` file, uploaded by
GitHub's pinned official artifact action with one-day retention, and removed in
an unconditional cleanup step. The bootstrap process never receives or exports
GitHub's internal artifact-service credential.

The action contains only public verification keys and generic transport code.
It does not contain a Nimbus hostname, a Zephyr repository coordinate, a
private signing key, entitlement logic, or a customer credential.

## Usage

Pin releases by full commit SHA:

```yaml
- uses: Cresting-Clouds/bootstrap@<full-commit-sha>
  with:
    ref: ${{ inputs.ref }}
  env:
    ALL_SECRETS_JSON: ${{ toJSON(secrets) }}
```

Runtime workflows must grant `id-token: write`. Customer workflow installation
and trust registration are managed by Cresting Clouds.

## Development

```shell
npm ci
npm test
npm run build
git diff --exit-code -- dist/index.js
```

`dist/index.js` is committed because GitHub Actions executes the bundled file.
