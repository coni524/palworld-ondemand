# palworld-ondemand: AWS Cloud Development Kit (CDK)

> Quick and easy deployment of an on-demand Palworld server with configurable
> settings using [AWS CDK].

# Introduction

Cloud Development Kit (CDK) is a relatively easy way to deploy infrastructure as code.  Within the context of this project, this is a CDK implementation of almost all of the required items to bring up and operate this project with some customizations.  This guide is built for beginners and is tailored toward a Windows experience.  Advanced or Linux users can gloss over the stuff that doesn't apply to them.

# Quickest Start (Windows)
Linux friends should be able to adapt this to their needs.

## Prerequisites

1. [Open an AWS Account]
2. [Create an Admin IAM User] (No access key required).
3. See the quick setup [Quick Start](https://github.com/coni524/palworld-ondemand?tab=readme-ov-file#quick-start)

No domain name is required: the server's public IP address (which changes on
every launch) is announced in the Discord startup notification as `IP:port`.

## Additional Configuration

Configuration values can all be passed in as environment variables or by using a 
`.env` file created from [`.env.sample`](./.env.sample). 

**Note:** Environment variables will take precedence over configuration values
set in `.env`.

| Config                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Default              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| SERVER_REGION                 | The AWS region to deploy your palworld server in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `us-east-1`          |
| STARTUP_MINUTES               | Number of minutes to wait for a connection after starting before terminating                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `10`                 |
| SHUTDOWN_MINUTES              | Number of minutes to wait after the last client disconnects before terminating                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `20`                 |
| TASK_MEMORY                   | The amount (in MiB) of memory used by the task running the Palworld server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `2048`               |
| TASK_CPU                      | The number of cpu units used by the task running the Palworld server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `1024`               |
| VPC_ID                        | VPC ID to deploy your server in. When this value is not specified, a new VPC is automatically created by default.                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| DISCORD_PUBLIC_KEY            | **Required** Public key of the Discord application, used to verify interaction signatures.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | --                   |
| DISCORD_GUILD_ID              | **Required** ID of the Discord server (guild) allowed to run the slash commands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | --                   |
| ADMIN_PASSWORD              | Palworld AdminPassword (also used by the watchdog for REST API Basic auth).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| SERVER_PASSWORD              | Palworld Password code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| BILLING_ALERT                 | Set to `true` to deploy a Lambda that periodically posts the month-to-date AWS cost to Discord. When unset or `false`, the billing resources are not created.                                                                                                                                                                                                                                                                                                                                                                                              | --                   |
| BILLING_ALERT_INTERVAL        | Interval of the billing report, in hours.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `6`                  |
| DEBUG                         | Enables debug mode (CloudWatch Logs for both containers and Container Insights on the cluster).                                                                                                                                                                                                                                                                                                                                                                                                                                                            | --                   |
| CDK_NEW_BOOTSTRAP             | Addresses issue for some users relating to AWS move to bootstrap v2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `1`                  |

## Discord integration

Beyond the two `DISCORD_*` values above, the Discord integration needs two one-time manual steps (see the [Quick Start](../README.md#quick-start) for the full walkthrough):

- Store the channel webhook URL in SSM Parameter Store in your `SERVER_REGION` — CloudFormation cannot create SecureString parameters:

  ```bash
  aws ssm put-parameter --region <SERVER_REGION> \
    --name /palworld/discord/webhook-url --type SecureString \
    --value 'https://discord.com/api/webhooks/...'
  ```

- After deploying, set the `DiscordInteractionsEndpointUrl` stack output as the Interactions Endpoint URL of the Discord application, and register the guild slash commands with [`scripts/register_discord_commands.sh`](../scripts/register_discord_commands.sh).

### Slash commands

`register_discord_commands.sh` registers the full command set. `/start` scales
the service up; every other command is backed by Palworld's official REST API
and only works while the server is running. All commands are hidden from
non-admins (`default_member_permissions: "0"`).

| Command | What it does |
|---|---|
| `/start` | Start the on-demand server |
| `/info` | Server name, version, description |
| `/players` | List players currently online |
| `/settings` | Show server settings |
| `/metrics` | Server FPS, uptime, player count |
| `/announce <message>` | Broadcast a message in-game |
| `/kick <userid> [message]` | Kick a player |
| `/ban <userid> [message]` | Ban a player |
| `/unban <userid>` | Remove a ban |
| `/save` | Save the world now |
| `/shutdown [waittime] [message]` | Shut down after a grace period |
| `/stop` | Force-stop immediately |

`userid` is the Palworld user id (e.g. `steam_0123456789ABCDEF`), as shown by
`/players`.

The receiver Lambda lives outside the VPC and cannot reach the task's private
IP, so REST calls are relayed through a VPC-internal **proxy Lambda** that only
ever talks to the task's private `IP:8212`. The port is never exposed to the
internet, and the admin password lives only in the proxy. The running task's
private IP is published to the `/palworld/server/private-ip` SSM parameter by
the watchdog on each startup — this needs no manual step (unlike the webhook
SecureString above).

## Cleanup

To remove all of the resources that were deployed on the deploy script run the following command:

```bash
pnpm run destroy
```

Note: Unless you changed the related configuration values, **running this script
will delete everything deployed by this template including your palworld server
data**.

Alternatively, you can delete the `palworld-server-stack` from the
[AWS Console](https://console.aws.amazon.com/cloudformation/).

## Troubleshooting

Set the `DEBUG` value in your [configuration](#configuration) to `true` to enable the following:

- CloudWatch Logs for the `palworld-server` ECS Container
- CloudWatch Logs for the `palworld-ecsfargate-watchdog` ECS Container
- Container Insights on the ECS cluster

### No Fargate configuration exists for given values

There are limited memory and vCPU configurations which are support by Fargate, in your `.env` ensure that you're using values supported here:

| CPU (TASK_CPU) | Memory (TASK_MEMORY)            |
|----------------|---------------------------------|
| 256            | 512, 1024, 2048                 |
| 512            | 1024 - 4096 in 1024 increments  |
| 1024           | 2048 - 8192 in 1024 increments  |
| 2048           | 4096 - 16384 in 1024 increments |
| 4096           | 8192 - 30720 in 1024 increments |

`1024` is equal to one vCPU or GB. For example, if I wanted 2 virtual cores and 8GB memory, this would be my `.env` configuration:

```
TASK_MEMORY                   = 8192
TASK_CPU                      = 2048
```

See [Invalid CPU or memory value specified](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html) for more details

### cdk destroy fails

Most CDK destroy failures can be resolved by running it a second time.  Other reasons may include:

- Is your task still running?
- Any manual changes in the console may require manual deletion or changeback for destroy to work properly

  [AWS CDK]: <https://aws.amazon.com/cdk/>
  [Open an AWS Account]: <https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/>
  [Install AWS CLI]: <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
  [Create an Admin IAM User]: <https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started_create-admin-group.html>
  [configure it]: <https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html>
  [NodeJS]: <https://nodejs.org/en/download/>
  [Git]: <https://git-scm.com/download/win>
  [Usage and Customization]: <https://github.com/doctorray117/palworld-ondemand#usage-and-customization>
  [palworld java docker]: https://hub.docker.com/r/itzg/palworld-server
  [palworld bedrock docker]: https://hub.docker.com/r/itzg/palworld-bedrock-server
