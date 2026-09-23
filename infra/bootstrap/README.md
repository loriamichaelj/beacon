# infra/bootstrap

Account-wide foundations for Beacon (see `docs/CLOUD-DEVOPS-DESIGN.md` §5.2):

- the Terraform state bucket, `loria-beacon-tfstate-<account-id>`
- the release artifacts bucket, `loria-beacon-releases-<account-id>`
- the four GitHub Actions deploy roles: `cloudbatch818-loria-beacon-deploy-{dev,stage,prod,shared}`
- `cloudbatch818-loria-beacon-instance-boundary`, the permissions boundary on every EC2 instance role

Names come from [`infra/project.env`](../project.env). The AWS account is shared, so every
name carries a project prefix, and IAM names must start with `cloudbatch818-`.

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

### 2. The bootstrap role (IAM → Roles → Create role)

1. Trusted entity: **Web identity**, choose the provider from step 1, audience `sts.amazonaws.com`.
   Skip the GitHub organization/repository fields; the trust policy is replaced next.
2. Skip attaching permissions. Name the role (see the naming note below) and create it.
3. Open the role → **Trust relationships** → Edit, and paste
   [`manual/bootstrap-role-trust.json`](manual/bootstrap-role-trust.json).
   Only a job running in the `bootstrap` GitHub Environment of this repository can assume it.
4. **Permissions** → Add permissions → Create inline policy → JSON, and paste
   [`manual/bootstrap-role-permissions.json`](manual/bootstrap-role-permissions.json).
   Any policy name works; reusing the role name is simplest.

This project's role is **`cloudbatch818-loria-beacon-bootstrap`**. The name must start with
`cloudbatch818-` (an account rule) and must **not** match `cloudbatch818-loria-beacon-deploy-*`.
The bootstrap role can only manage roles matching that pattern, so a name outside it keeps
the role from modifying its own permissions. Nothing else references the name; the workflow
only uses the ARN from the `AWS_ROLE_ARN` secret.

### 3. The `bootstrap` GitHub Environment (repo → Settings → Environments → New environment)

| Setting | Value |
|---|---|
| Name | `bootstrap` |
| Required reviewers | yourself |
| Deployment branches and tags | Selected branches → `main` |
| Environment secret `AWS_ROLE_ARN` | `arn:aws:iam::<ACCOUNT_ID>:role/cloudbatch818-loria-beacon-bootstrap` |

## Running it

Actions → **bootstrap** → Run workflow, with `action=plan` first and then `action=apply`.
`ref` selects which branch's `infra/bootstrap` code to run (default `dev`).

The workflow:

1. Loads `infra/project.env`, then assumes the bootstrap role via OIDC.
2. Creates the state bucket if it's missing (`scripts/bootstrap/ensure-state-bucket.sh`).
3. Runs `terraform init` against `s3://loria-beacon-tfstate-<account-id>/env:/shared/bootstrap.tfstate`.
4. Runs `plan`, then `apply` if requested. The first apply imports the state bucket and
   creates everything else.
5. Lists the deploy role names in the job summary. It shows names, not ARNs, because the repo is
   public and ARNs contain the account ID.

## After the first apply

Create one GitHub Environment per deploy role, each with an `AWS_ROLE_ARN` secret of
`arn:aws:iam::<ACCOUNT_ID>:role/<role>`:

| Environment | Role | Required reviewers |
|---|---|---|
| `shared` | `cloudbatch818-loria-beacon-deploy-shared` | yes |
| `dev` | `cloudbatch818-loria-beacon-deploy-dev` | none |
| `stage` | `cloudbatch818-loria-beacon-deploy-stage` | yes |
| `prod` | `cloudbatch818-loria-beacon-deploy-prod` | yes (ideally someone other than stage's reviewer) |

The bootstrap role is then only needed when this root changes. Examples: adding the DNS
and Packer permissions to the shared role in later steps, or tightening a deploy role
after an AccessDenied.
