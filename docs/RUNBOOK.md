# Beacon Runbook

How to operate Beacon on AWS. The design is in
[`CLOUD-DEVOPS-DESIGN.md`](CLOUD-DEVOPS-DESIGN.md); this is the "how do I…" companion.

**Scope today: dev only.** Stage and prod have GitHub Environments, deploy roles, and
code paths, but no infrastructure. Everything below works the same way for them once
`terraform` (target=infra) has been applied there.

**All AWS access goes through GitHub Actions.** Nobody runs `aws` or `terraform`
locally. Every procedure below is a workflow run (Actions tab, or `gh workflow run …`),
plus the AWS Console for read-only inspection and Session Manager.

---

## At a glance

| | dev |
|---|---|
| URL | http://loria-beacon-dev-alb-1935253953.us-east-1.elb.amazonaws.com (HTTP until DNS/TLS lands) |
| Auto Scaling Group | `loria-beacon-dev-asg` (1–2 × t3.micro) |
| Database | `loria-beacon-dev-db` (RDS PostgreSQL 16, private, TLS required) |
| Release pointer | SSM `/loria-beacon/dev/release-version` |
| Logs | CloudWatch `/loria-beacon/dev/api` (container), `/loria-beacon/dev/nginx` |
| Base AMI pointer | SSM `/loria-beacon/base-ami-id` (shared by all environments) |
| Releases | `s3://loria-beacon-releases-<account>/<version>/` |
| Terraform state | `s3://loria-beacon-tfstate-<account>/env:/{shared,dev,stage,prod}/…` |

### Workflows (all on `main`)

| Workflow | What it does | Approval |
|---|---|---|
| **deploy** | Test → build/publish (dev only) → migrate → roll out → smoke tests (curl + browser) → notify | dev: none |
| **rollback** | Roll back to an earlier release by default, SHA, or version, under the rollback rules | dev: none; stage/prod: reviewer |
| **seed** | Load sample data into dev (idempotent) | none |
| **terraform** | plan / apply / destroy for `network`, `dns`, `infra` (per environment) | `shared`, stage, prod: reviewer |
| **ami** | Build the base AMI (Packer), or republish an existing one; keeps the newest 3 | `shared`: reviewer |
| **bootstrap** | State bucket, releases bucket, deploy roles, IAM policies | `bootstrap`: reviewer |
| **test** | App lint + tests for any ref (also run by deploy and on every push to `dev`) | none |
| **ci** | Lints workflows on PRs into `main` (required check) | none |
| dev-ci *(stub on `dev`)* | Runs **test** on every push to `dev` | none |

### Release versions

A release version is a 12-character hash of the `backend/` and `frontend/` code at a commit
(`scripts/release/version.sh [<commit>]`). Commits that only change infra, scripts, or docs
keep the same version, so they never trigger a rebuild. `make version` shows the current one.

---

## Routine operations

### Deploy to dev

Actions → **deploy** → `ref=dev`. That runs:

- **Tests:** lint and tests.
- **Build:** only if this release version isn't published yet.
- **Migrations:** only if the version changed.
- **Rollout:** a rolling instance refresh, where new instances must pass `/readyz` before old ones go.
- **Smoke tests:** curl checks, then a headless-browser check of the UI.

A deploy takes about 8–10 minutes, and the site stays up throughout.

- **Nothing to deploy:** if dev already runs this version, the run stops with a notice.
- **`force=true`:** replaces instances anyway, with no build and no migrations. Use it to pick up a new base AMI.

### Seed sample data (dev)

Actions → **seed**. Loads 8 services and 20 incidents. It does nothing if any service already exists.

### Rebuild or change the base AMI

1. Edit `ami/` on `dev` and push.
2. Actions → **ami** (`ref=dev`), then approve in `shared`. This builds the image (~8 min), publishes it to `/loria-beacon/base-ami-id`, and prunes all but the newest 3.
3. The new AMI reaches an environment at its next instance refresh: **deploy** with `force=true`.

**AMI rollback:** Actions → **ami** with `ami_id=<older AMI>` republishes it without a build, then **deploy** with `force=true`.

### Change infrastructure

1. Edit `infra/…` on `dev` and push.
2. Actions → **terraform** → `action=plan` with the right `target` (and `environment` for `infra`). Read the plan.
3. Run the same thing with `action=apply`.

If an apply fails with `AccessDenied` / `UnauthorizedOperation`, the deploy role is missing a
permission. The fix goes in `infra/bootstrap/iam.tf`, followed by **bootstrap** (plan, then apply),
then the terraform run again. The error names the exact action and resource.

---

## Incidents

### Something failed: where to look

1. **The GitHub issue `[<env>] pipeline failure`** (label `pipeline-failure`). Any failed deploy or
   real rollback opens or updates it, assigned to whoever ran the pipeline. The next success
   closes it. It links the run.
2. **The run's job summary:** release, from/to, rule results, and the smoke check output.
3. **CloudWatch Logs:** `/loria-beacon/dev/api` for the backend (JSON, one stream per instance)
   and `/loria-beacon/dev/nginx`.
4. **A shell on an instance:** EC2 console → the instance → **Connect → Session Manager**. There
   is no SSH anywhere; sessions are logged. Useful commands: `docker ps`,
   `docker logs beacon-api`, `sudo cat /var/log/cloud-init-output.log`, and
   `curl -s localhost:8000/readyz`.

### Roll back

Actions → **rollback**, `environment=dev`, and a **reason** (required).

| Goal | Inputs |
|---|---|
| Back to the previous release | nothing else |
| Back to the release built from a commit | `sha=<full or short SHA>` |
| Back to a specific release | `version=<12-char version>` |
| Check first without changing anything | `dry_run=true` (shows the rule results and the last 10 releases) |

A rollback replaces instances without downtime (~6–7 min) and never touches the database.

**Rollback rules.** They're checked before anything changes; the run's summary shows each result.

1. **Published:** the target release exists in the releases bucket.
2. **Proven:** it has run in this environment before. Dev can override with `allow_unproven`; stage and prod can't.
3. **Schema:** if `backend/alembic/versions/` differs between the running release and the target, the target must be the *previous* release. Rollbacks don't undo migrations, and only N-1 is guaranteed to work on the current schema. Override with `allow_schema_change` only when you've confirmed the older code copes.

If the rollout itself fails, the release pointer goes back to what was running, so the
environment is left as it was.

### Roll forward

Roll forward is just a rollback to a newer release: **rollback** with `sha=` or `version=` of the
release you want. Alternatively, fix on `dev` and **deploy**.

### Roll back an infrastructure change

This is not automated (design §7.2).

1. Revert the Terraform change on `dev` (`git revert`), then push.
2. **terraform** `plan` for the affected target and environment. Confirm it undoes exactly the bad change.
3. **terraform** `apply`.

---

## Cost control: tear down and rebuild dev

Running cost is about **$105/month**:

| Component | Monthly cost |
|---|---|
| VPC interface endpoints (independent of use) | ~$58 |
| ALB | ~$24 |
| RDS | ~$13 |
| EC2 | ~$8 |
| AMI snapshots and S3 | pennies |

**Tear down** (dev's data is lost; dev has no final snapshot):

1. **terraform** `action=destroy`, `target=infra`, `environment=dev`. Stops about $45/month.
2. Optional: **terraform** `action=destroy`, `target=network` (approve in `shared`). Stops the endpoints (~$58/month). Only after *every* environment's infra is destroyed.

**Never destroy `bootstrap`.** Its buckets hold all Terraform state and releases, and its roles
are what every workflow authenticates as. It costs nothing.

**Rebuild:**

1. If the network is gone: **terraform** `apply` `target=network` (~2 min).
2. **terraform** `apply` `target=infra`, `environment=dev` (~10 min, mostly RDS). The instance
   will fail health checks and be replaced every few minutes until step 3. That's expected
   while `release-version` is `none`.
3. **deploy** `ref=dev`. The release is already published, so there's no rebuild. Migrations run
   against the new database, and nothing is serving, so all instances are replaced at once.
4. **seed**, if you want sample data.

Re-creating the network gives it new VPC and subnet IDs. `infra/env` reads them from the network
state, so nothing else needs to change.

---

## Troubleshooting notes (things that have actually happened)

| Symptom | Cause | Fix |
|---|---|---|
| `Unable to resolve action …@v10` | The action publishes exact tags only | Pin the exact version (e.g. `setup-uv@v10.2.0`); `ci` lints workflow changes |
| `CreateLaunchTemplate … SsmInvalidParameter: Unsupported data type` | `base-ami-id` wasn't `aws:ec2:image` | Fixed in `ami.yml`; republish with `ami_id=` if the parameter is ever recreated by hand |
| `UnauthorizedOperation … ec2:RunInstances on …image/ami-…` | IAM request-tag conditions don't cover resources a launch *uses* | Grant those resources explicitly (see `infra/bootstrap/iam.tf`) |
| UI shows `crypto.randomUUID is not a function` | Browsers withhold some APIs from plain-HTTP pages | Fixed in `frontend/src/api/client.ts`; the browser smoke test now catches this class of bug |
| First `/readyz` after a rollout is 502 | New target still registering with the ALB | Normal; the smoke test retries for up to 2 minutes |
| Instances keep being replaced on a fresh environment | `release-version` is `none`, so `/readyz` fails | Run **deploy** |
| Terraform always shows an in-place change to the DB parameter group | Provider default `apply_method` vs. what RDS reports | Fixed by pinning `apply_method = "pending-reboot"` |

## Don'ts

- Don't commit or print the AWS account ID. The repo is public. Workflows mask it; files use `<ACCOUNT_ID>`.
- Don't push to `stage`/`prod` or force-push them. Protection blocks it; promotion is by PR.
- Don't run Terraform or the AWS CLI locally. Use the workflows.
