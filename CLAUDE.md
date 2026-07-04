# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

On-demand Palworld dedicated server on AWS: an ECS Fargate service normally sits at `desiredCount: 0`, a Lambda behind a Function URL (invoked by a Discord `/start` slash command) scales it to 1, and a watchdog sidecar container scales it back to 0 when no players are connected. There is no fixed DNS name: the watchdog announces the task's public `IP:port` in the Discord startup notification, so no domain or Route 53 zone is needed. Adapted from doctorray117/minecraft-ondemand, which explains some leftover naming (`MC_SERVER_CONTAINER_NAME`).

## Commands

This repo uses **pnpm** (npm is not used; `packageManager` is pinned in `cdk/package.json`). All CDK work happens in `cdk/` (requires a populated `.env`, copied from `.env.sample` — `DISCORD_PUBLIC_KEY`, `DISCORD_GUILD_ID`, `ADMIN_PASSWORD`, `SERVER_PASSWORD`, `SERVER_REGION` are required):

```bash
cd cdk
pnpm install
pnpm run build      # alias of `bootstrap` = cdk bootstrap (NOT a compile — cdk.json runs ts-node directly)
pnpm run deploy     # cdk deploy --all (use `pnpm run` — bare `pnpm deploy` hits pnpm's builtin deploy command)
pnpm run diff       # cdk diff
pnpm run synth      # cdk synth --all
pnpm run destroy    # cdk destroy --all (deletes server data)
pnpm run typecheck  # tsc --noEmit (use typecheck:watch for watch mode)
```

There are no tests and no linter (only a `.prettierrc`).

Offline synth verification (no AWS credentials needed): create a dummy `cdk/.env` and run the app directly. Synth bundles the Discord interactions Lambda by running `pip install` (cross-platform to `manylinux2014_x86_64`), so it needs network access on the first run and a local `python3`/pip (falls back to Docker if pip fails):

```bash
CDK_DEFAULT_ACCOUNT=123456789012 CDK_DEFAULT_REGION=us-east-1 CDK_OUTDIR=/tmp/cdk.out \
  pnpm exec ts-node --prefer-ts-exts bin/cdk.ts
```

The watchdog is not a custom image: `palworld-ecsfargate-watchdog/watchdog.sh` is read at synth time (`fs.readFileSync` in `palworld-stack.ts`) and run inline as the container command (`bash -c <script>`) on AWS's official AWS CLI image (`public.ecr.aws/aws-cli/aws-cli`, on ECR Public), which already bundles the `bash`/`curl`/`jq` the script needs. There is no image build, no Docker Hub, and no CI pipeline for the watchdog.

## Architecture

A single CDK stack, **`palworld-server-stack`** (`cdk/bin/cdk.ts` → `palworld-stack.ts`), deployed to `SERVER_REGION`. Everything lives in one region; there is no cross-region wiring. The stack contains:

- **Network/storage/compute:** VPC (created unless `VPC_ID` is set), EFS with access point mounted at `/palworld/Pal/Saved`, Fargate cluster/service with two containers (the game server `thijsvanloef/palworld-server-docker` marked non-essential, and the watchdog marked essential so its exit stops the task).
- **Discord interactions Lambda** (`discord-interactions.ts` construct, code in `lambda/discord_interactions/`, Python, fixed name `palworld-discord-interactions`) with a public Function URL (exported as the `DiscordInteractionsEndpointUrl` output). It verifies the Ed25519 signature with `discord-interactions` (bundled at synth time via pip), checks the payload's `guild_id`, returns a deferred response within Discord's 3-second limit, then invokes itself asynchronously to set `desiredCount: 1` and post the follow-up message. The ECS service-control policy is attached to both the ECS task role and this Lambda's role.
- **Notifications:** one SNS topic shared by the watchdog (startup/shutdown) and the billing report. A `DiscordNotificationForwarder` construct (`discord-notification-forwarder.ts`, code in `lambda/discord_notification/`) subscribes to it and POSTs the plain-text message to a Discord channel webhook. The webhook URL is read at runtime from the SSM SecureString `/palworld/discord/webhook-url` in the same region, which must be created manually (CloudFormation can't create SecureStrings).
- **Billing report** (`billing-alert.ts` construct, code in `lambda/billing_report/`, only created when `BILLING_ALERT=true`): Lambda on an EventBridge schedule publishes the month-to-date cost to the shared topic. The Cost Explorer API is a global service behind a us-east-1 endpoint that the SDK resolves from any region, so it works in `SERVER_REGION`.

The cluster/service/container names live in `constants.ts` — the watchdog and the Discord Lambda locate the ECS service by these names, so they must stay in sync.

**Capacity/architecture:** the task always runs on FARGATE_SPOT with x86_64 (the Palworld server binary is x86_64-only — ARM64 would need Box64 emulation — and Fargate Spot doesn't support ARM64 anyway).

**Watchdog lifecycle** (`palworld-ecsfargate-watchdog/watchdog.sh`): on task start it looks up its own public IP via the ECS task metadata endpoint, waits for the REST API to respond (which also means the game server is up, with a 10-minute timeout that scales back to 0 if the server never comes up), publishes a plain-text startup message containing `IP:GAMEPORT` to SNS, then polls player count via the official REST API (`GET /v1/api/players` on localhost:8212, Basic auth with `ADMIN_PASSWORD`) — scaling the service to 0 after `STARTUPMIN` (default 10) minutes with no first connection, or `SHUTDOWNMIN` (default 20) minutes after the last player leaves. It also traps SIGTERM (Fargate Spot interruption) and scales to 0 cleanly.

**Configuration** flows from `cdk/.env` through `config.ts` (`resolveConfig()`; real environment variables take precedence over `.env`). All options are documented in `cdk/README.md`, including the valid Fargate CPU/memory combinations.

**Debug logging:** container logs (game server and watchdog) and Container Insights on the cluster are only enabled when `DEBUG=true` in `.env`.
