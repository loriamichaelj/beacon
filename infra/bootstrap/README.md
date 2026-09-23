# infra/bootstrap

Account-wide foundations for Beacon (see `docs/CLOUD-DEVOPS-DESIGN.md` §5.2):

- the Terraform state bucket, `beacon-tfstate-<account-id>`
- the release artifacts bucket, `beacon-releases-<account-id>`
- the four GitHub Actions deploy roles: `beacon-deploy-{dev,stage,prod,shared}`
- `beacon-instance-boundary`, the permissions boundary on every EC2 instance role

All AWS access runs through GitHub Actions. This root is only ever applied by the
`bootstrap.yml` workflow on `main`, never from a laptop.

## One-time manual setup

AWS has to trust GitHub before any workflow can reach it, and a workflow can't
grant itself that trust. These three steps are the only manual AWS/GitHub
configuration in the project. Replace `<ACCOUNT_ID>` with your 12-digit account ID
throughout.

### 1. GitHub OIDC identity provider (AWS Console → IAM → Identity providers → Add provider)

| Field | Value |
|---|---|
| Provider type | OpenID Connect |
| Provider URL | `https://token.actions.githubusercontent.com` |
| Audience | `sts.amazonaws.com` |

Terraform reads this provider, but never manages it.

### 2. The `beacon-bootstrap` role (IAM → Roles → Create role)

1. Trusted entity: **Web identity**, choose the provider from step 1, audience `sts.amazonaws.com`.
   Skip the GitHub organization/repository fields; the trust policy is replaced next.
2. Skip attaching permissions. Name the role **`beacon-bootstrap`** and create it.
3. Open the role → **Trust relationships** → Edit, and paste
   [`manual/bootstrap-role-trust.json`](manual/bootstrap-role-trust.json).
   Only a job running in the `bootstrap` GitHub Environment of this repository can assume it.
4. **Permissions** → Add permissions → Create inline policy → JSON, and paste
   [`manual/bootstrap-role-permissions.json`](manual/bootstrap-role-permissions.json).
   Name it `beacon-bootstrap`.

The name matters. The bootstrap role can only manage `beacon-deploy-*` roles, so it can't
modify its own permissions.

### 3. The `bootstrap` GitHub Environment (repo → Settings → Environments → New environment)

| Setting | Value |
|---|---|
| Name | `bootstrap` |
| Required reviewers | yourself |
| Deployment branches and tags | Selected branches → `main` |
| Environment secret `AWS_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/beacon-bootstrap` |

## Running it

Actions → **bootstrap** → Run workflow, with `action=plan` first and then `action=apply`.
`ref` selects which branch's `infra/bootstrap` code to run (default `dev`).

The workflow:

1. Assumes `beacon-bootstrap` via OIDC.
2. Creates the state bucket if it's missing (`scripts/bootstrap/ensure-state-bucket.sh`).
3. Runs `terraform init` against `s3://beacon-tfstate-<account-id>/env:/shared/bootstrap.tfstate`.
4. Runs `plan`, then `apply` if requested. The first apply imports the state bucket and
   creates everything else.
5. Lists the deploy role names in the job summary. It shows names, not ARNs, because the repo is
   public and ARNs contain the account ID.

## After the first apply

Create one GitHub Environment per deploy role, each with an `AWS_ROLE_ARN` secret of
`arn:aws:iam::<ACCOUNT_ID>:role/<role>`:

| Environment | Role | Required reviewers |
|---|---|---|
| `shared` | `beacon-deploy-shared` | yes |
| `dev` | `beacon-deploy-dev` | none |
| `stage` | `beacon-deploy-stage` | yes |
| `prod` | `beacon-deploy-prod` | yes (ideally someone other than stage's reviewer) |

`beacon-bootstrap` is then only needed when this root changes. Examples: adding the DNS
and Packer permissions to the shared role in later steps, or tightening a deploy role
after an AccessDenied.
