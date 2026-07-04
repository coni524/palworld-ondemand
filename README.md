<div align="center">
  <a href="https://github.com/coni524/palworld-ondemand/stargazers"><img src="https://img.shields.io/github/stars/coni524/palworld-ondemand" alt="Stars Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/network/members"><img src="https://img.shields.io/github/forks/coni524/palworld-ondemand" alt="Forks Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/pulls"><img src="https://img.shields.io/github/issues-pr/coni524/palworld-ondemand" alt="Pull Requests Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/issues"><img src="https://img.shields.io/github/issues/coni524/palworld-ondemand" alt="Issues Badge"/></a>
<a href="https://github.com/coni524/palworld-ondemand/graphs/contributors"><img alt="GitHub contributors" src="https://img.shields.io/github/contributors/coni524/palworld-ondemand?color=2b9348"></a>
<a href="https://github.com/coni524/palworld-ondemand/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-2b9348" alt="License Badge"/></a>
</div>

# palworld-ondemand

On-demand Palworld dedicated server on AWS.

Run `/start` in Discord and the server comes up on ECS Fargate Spot; a few minutes later its address (`IP:port`) is posted to your Discord channel. When nobody is playing, a watchdog shuts the server down again, so you pay for compute only while playing. No domain name is required.

[日本語版](./README-ja.md)

## Architecture

![Architecture](docs/diagrams/aws-architecture-v2.svg)

## Quick Start

You need an AWS account, a Palworld client, and a Discord server (guild) you administer. Everything below runs in AWS CloudShell, so no local tooling is required.

For all configuration options (CPU/memory sizing, existing VPC, billing report, debug logging) and troubleshooting, see [cdk/README.md](./cdk/README.md).

### 1. Create a Discord application

1. Create an application from `New Application` in the [Discord Developer Portal].
2. Note the **Application ID** and the **Public Key** on the `General Information` page.
3. Add a bot on the `Bot` page and note the **Bot Token** (used only by the command-registration script below; it is never stored in AWS).
4. Install the application to your Discord server via the install link on the `Installation` page. The `applications.commands` scope is required.
5. Enable `Settings > Advanced > Developer Mode` in your Discord client, right-click your server name, and copy the **Server ID** (guild ID).
6. Create a webhook under `Integrations > Webhooks` in the channel that should receive notifications and note the **Webhook URL**.

### 2. Configure and deploy

![cloudshell](docs/cloudshell.png)

In AWS CloudShell, clone the repository and fill in the required values:

```
git clone https://github.com/coni524/palworld-ondemand.git
cd palworld-ondemand/cdk/
cp -p .env.sample .env
vi .env
```

```
# Required
DISCORD_PUBLIC_KEY            = 3717e9b6247e0a5e9db9e0e70d842c3a...
DISCORD_GUILD_ID              = 1234567890123456789
ADMIN_PASSWORD                = worldofpaladmin
SERVER_PASSWORD               = worldofpal
SERVER_REGION                 = ap-northeast-1
```

Store the webhook URL in SSM Parameter Store in the same region as `SERVER_REGION` (CloudFormation cannot create SecureString parameters, so this single value is registered by hand):

```
aws ssm put-parameter --region ap-northeast-1 \
  --name /palworld/discord/webhook-url --type SecureString \
  --value 'https://discord.com/api/webhooks/...'
```

Install pnpm via Corepack, then deploy. AWS CloudShell does not ship a compatible pnpm, so install Node.js 22 with nvm and let Corepack provide the pnpm version this repository pins. nvm and Node.js are installed under your home directory, so they survive across CloudShell sessions:

```
# Install nvm + Node.js 22 (Corepack ships with Node; it reads the pinned pnpm version from cdk/package.json)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.5/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
corepack enable
```

```
pnpm install
pnpm run build && pnpm run deploy
```

If Corepack prompts to download pnpm, answer `Y`. Reconnecting to CloudShell later starts a fresh shell, so reload nvm before running pnpm again (the nvm installer also appends these lines to `~/.bashrc`):

```
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

When the deploy finishes, note the **DiscordInteractionsEndpointUrl** value that `palworld-server-stack` outputs.

### 3. Connect Discord

1. On the `General Information` page of the [Discord Developer Portal], set **Interactions Endpoint URL** to the URL from the deploy output and save. Discord sends a verification request on save, so do this after the deploy has finished.
2. Register the slash commands:

```
DISCORD_APP_ID=<Application ID> \
DISCORD_BOT_TOKEN=<Bot Token> \
DISCORD_GUILD_ID=<Server ID> \
./scripts/register_discord_commands.sh
```

This registers all 12 commands (see [Commands](#commands)) in your guild only. Every command is hidden from everyone except server admins by default (`default_member_permissions`); grant additional roles or members under `Server Settings > Integrations` afterwards.

### 4. Play

Run `/start` in your Discord server. After a few minutes the webhook channel receives the startup notification:

```
🟢 palworld-server is online at 203.0.113.10:8211
```

Add the address to the Palworld server list and connect with `SERVER_PASSWORD`. The IP address changes on every launch, so use the one from the latest notification.

The server stops itself after 10 minutes without a first connection, or 20 minutes after the last player leaves (both configurable).

## Commands

`/start` scales the ECS service up. The other 11 commands are backed by Palworld's official REST API and only work while the server is running; when it is stopped they reply that the server is offline. All commands are admin-only by default.

| Command | What it does |
|---|---|
| `/start` | Start the on-demand server |
| `/info` | Server name, version and description |
| `/players` | List the players currently online |
| `/settings` | Show the server settings |
| `/metrics` | Server FPS, uptime and player count |
| `/announce <message>` | Broadcast a message in-game |
| `/kick <userid> [message]` | Kick a player by Palworld user id |
| `/ban <userid> [message]` | Ban a player by Palworld user id |
| `/unban <userid>` | Remove a ban |
| `/save` | Save the world now |
| `/shutdown [waittime] [message]` | Shut down after a grace period |
| `/stop` | Force-stop the server immediately |

The `userid` is the Palworld user id, e.g. `steam_0123456789ABCDEF`.

## Cost

The server always runs on Fargate Spot (x86_64; the Palworld binary is x86_64-only), which is up to 70% cheaper than regular Fargate. AWS can reclaim Spot capacity at any time, but the watchdog traps the termination signal and shuts the server down safely.

- Rough guide: $0.29 per hour of play with a 4 vCPU / 16 GB memory task — about $5.81 for 20 hours a month ([AWS Estimate]). The `.env.sample` default is a smaller 2 vCPU / 4 GB task.
- Compute is billed only while the server is running. While stopped, the only recurring charge is EFS storage for the save data, which is small.
- Set `BILLING_ALERT=true` to have the month-to-date AWS cost posted to Discord periodically, and consider an AWS [Billing Alert] as a backstop.

## Security notes

- The game ports (UDP 8211 and 27015) are open to the whole internet so that players can join; `SERVER_PASSWORD` is the only gate, so use one that cannot be guessed. To lock things down further, restrict the source IP ranges on the service security group after deploying.
- Every command is protected in three layers: it is registered only in your guild, only server admins can run it by default (grant others under `Server Settings > Integrations`), and the Lambda verifies Discord's Ed25519 request signature plus the guild ID. The Function URL is public, but it rejects everything that does not come from Discord.
- Keep secrets out of the repository: `cdk/.env` holds the server passwords and is gitignored — do not commit it. The Bot Token is used once by the registration script and never stored in AWS. The webhook URL lives only in SSM Parameter Store as a SecureString.
- The management REST API on port 8212 is never exposed to the internet. It is reached only through a VPC-internal proxy Lambda: the task security group opens 8212 to that Lambda's security group alone, and the proxy Lambda has no Function URL and no internet egress. `ADMIN_PASSWORD` is held only by the task and that proxy Lambda.

## Acknowledgements

Adapted from [doctorray117/minecraft-ondemand](https://github.com/doctorray117/minecraft-ondemand). Issues and pull requests are welcome.

[Discord Developer Portal]: https://discord.com/developers/applications
[aws estimate]: https://calculator.aws/#/estimate?id=ebd1972b24b7d393610389a0017d3e1f8df2ed56
[billing alert]: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/monitor_estimated_charges_with_cloudwatch.html
