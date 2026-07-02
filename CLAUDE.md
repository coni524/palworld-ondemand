# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

On-demand Palworld dedicated server on AWS: an ECS Fargate service normally sits at `desiredCount: 0`, a Lambda invoked from Slack (via AWS Chatbot) scales it to 1, and a watchdog sidecar container scales it back to 0 when no players are connected. Adapted from doctorray117/minecraft-ondemand, which explains some leftover naming (`MC_SERVER_CONTAINER_NAME`, minecraft defaults in the Lambda).

## Commands

This repo uses **pnpm** (npm is not used; `packageManager` is pinned in `cdk/package.json`). All CDK work happens in `cdk/` (requires a populated `.env`, copied from `.env.sample` — `DOMAIN_NAME`, `SLACK_WORKSPACE_ID`, `SLACK_CHANNEL_ID`, `ADMIN_PASSWORD`, `SERVER_PASSWORD`, `SERVER_REGION` are required):

```bash
cd cdk
pnpm install
pnpm run build      # alias of `bootstrap` = cdk bootstrap (NOT a compile — cdk.json runs ts-node directly)
pnpm run deploy     # cdk deploy --all (use `pnpm run` — bare `pnpm deploy` hits pnpm's builtin deploy command)
pnpm run diff       # cdk diff
pnpm run synth      # cdk synth --all
pnpm run destroy    # cdk destroy --all (deletes server data; reset the A record to 192.168.1.1 first or destroy fails)
pnpm run typecheck  # tsc --noEmit (use typecheck:watch for watch mode)
```

There are no tests and no linter (only a `.prettierrc`).

Offline synth verification (no AWS credentials needed): create a dummy `cdk/.env` and run the app directly — missing Route 53 lookup context resolves to placeholder values:

```bash
CDK_DEFAULT_ACCOUNT=123456789012 CDK_DEFAULT_REGION=us-east-1 CDK_OUTDIR=/tmp/cdk.out \
  pnpm exec ts-node --prefer-ts-exts bin/cdk.ts
```

The watchdog container is consumed from Docker Hub (`coni524/palworld-ecsfargate-watchdog`), not built during deploy — the `DockerImageAsset` path in `palworld-stack.ts` is commented out. A GitHub Actions workflow (`.github/workflows/watchdog-image.yml`) builds a multi-arch (amd64/arm64) image and pushes it to Docker Hub on pushes to `main` that touch `palworld-ecsfargate-watchdog/` (requires `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` repo secrets).

## Architecture

Three CDK stacks in `cdk/bin/cdk.ts`, deployed in dependency order:

1. **`palworld-domain-stack`** (`domain-stack.ts`, pinned to **us-east-1** because Route 53 query logs only go there): creates a delegated hosted zone `<SUBDOMAIN_PART>.<DOMAIN_NAME>` with query logging, a placeholder A record, and the launcher Lambda (`lambda/ecs_service_manager/`, Python). The original DNS-query-triggered launch (CloudWatch Logs subscription filter → Lambda) is **intentionally disabled** (commented out); launch happens only via Slack `@aws` alias invoking the Lambda directly.
2. **`billing-alert-stack`** (`billingalert-stack.ts`, us-east-1 for Cost Explorer access): Lambda (`lambda/billing_report/`) on an EventBridge schedule publishes the month-to-date cost to SNS → Slack.
3. **`palworld-server-stack`** (`palworld-stack.ts`, deployed to `SERVER_REGION`): VPC (created unless `VPC_ID` is set), EFS with access point mounted at `/palworld/Pal/Saved`, Fargate cluster/service with two containers (the game server `thijsvanloef/palworld-server-docker` marked non-essential, and the watchdog marked essential so its exit stops the task), and the AWS Chatbot Slack channel configuration.

**Cross-region wiring:** stacks can't use CloudFormation exports across regions, so the domain stack writes values (hosted zone ID, Lambda ARN, Lambda role ARN, billing SNS topic ARN) to SSM parameters in us-east-1, and the server stack reads them with the custom `SSMParameterReader` construct (`ssm-parameter-reader.ts`, an `AwsCustomResource` that re-fetches on every deploy). Parameter names and the cluster/service/container names live in `constants.ts` — the watchdog locates the ECS service by these names, so they must stay in sync.

**Capacity/architecture coupling:** `USE_FARGATE_SPOT=true` → x86_64 on FARGATE_SPOT; `false` → ARM64 on regular FARGATE (Spot doesn't support ARM64). Both container images must therefore support both architectures.

**Watchdog lifecycle** (`palworld-ecsfargate-watchdog/watchdog.sh`): on task start it looks up its own public IP via the ECS task metadata endpoint and UPSERTs the Route 53 A record, waits for the game/RCON ports, notifies Slack via SNS, then polls player count with `rcon ShowPlayers` — scaling the service to 0 after `STARTUPMIN` (default 10) minutes with no first connection, or `SHUTDOWNMIN` (default 20) minutes after the last player leaves. It also traps SIGTERM (Fargate Spot interruption) and scales to 0 cleanly. SNS messages are formatted as AWS Chatbot custom-notification JSON.

**Configuration** flows from `cdk/.env` through `config.ts` (`resolveConfig()`; real environment variables take precedence over `.env`). All options are documented in `cdk/README.md`, including the valid Fargate CPU/memory combinations.

**Debug logging:** container logs (game server and watchdog) are only sent to CloudWatch when `DEBUG=true` in `.env`.
