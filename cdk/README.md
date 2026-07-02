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
3. [Pick](https://domains.google) [a](https://namecheap.com) [registrar](https://networksolutions.com) [and](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/domain-register.html) [register](https://domain.com) [a](https://register.com) [domain](https://godaddy.com) [name](https://enom.com).
4. [Create a public hosted zone] for your domain name in Route 53.
5. [Change the DNS servers] for your new domain to the ones listed in the Route 53 console from step 5.
6. See the quick setup [Quick Start](https://github.com/coni524/palworld-ondemand?tab=readme-ov-file#quick-start)

## Additional Configuration

Configuration values can all be passed in as environment variables or by using a 
`.env` file created from [`.env.sample`](./.env.sample). 

**Note:** Environment variables will take precedence over configuration values
set in `.env`.

| Config                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Default              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| DOMAIN_NAME                   | **Required** Domain name of existing Route53 Hosted Zone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | --                   |
| SUBDOMAIN_PART                | Name of the subdomain part to be used for creating a delegated hosted zone (palworld.example.com) and an NS record on your existing (example.com) hosted zone. This subdomain should not already be in use.                                                                                                                                                                                                                                                                                                                                               | `palworld`          |
| SERVER_REGION                 | The AWS region to deploy your palworld server in.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `us-east-1`          |
| STARTUP_MINUTES               | Number of minutes to wait for a connection after starting before terminating                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `10`                 |
| SHUTDOWN_MINUTES              | Number of minutes to wait after the last client disconnects before terminating                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `20`                 |
| TASK_MEMORY                   | The amount (in MiB) of memory used by the task running the Palworld server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `2048`               |
| TASK_CPU                      | The number of cpu units used by the task running the Palworld server.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `1024`               |
| VPC_ID                        | VPC ID to deploy your server in. When this value is not specified, a new VPC is automatically created by default.                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| TWILIO_PHONE_FROM             | Your twilio phone number. (i.e `+1XXXYYYZZZZ`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | --                   |
| TWILIO_PHONE_TO               | Phone number to receive text notifications at.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | --                   |
| TWILIO_ACCOUNT_ID             | Twilio account ID.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | --                   |
| TWILIO_AUTH_CODE              | Twilio auth code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| SLACK_WORKSPACE_ID              | Slack workspace ID code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| SLACK_CHANNEL_ID              | Slack channel ID code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| ADMIN_PASSWORD              | Palworld AdminPassword (also used by the watchdog for REST API Basic auth).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| SERVER_PASSWORD              | Palworld Password code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | --                   |
| DEBUG                         | Enables debug mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | --                   |
| CDK_NEW_BOOTSTRAP             | Addresses issue for some users relating to AWS move to bootstrap v2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `1`                  |

## Cleanup

To remove all of the resources that were deployed on the deploy script run the following command:

```bash
pnpm run destroy
```

Note: Unless you changed the related configuration values, **running this script
will delete everything deployed by this template including your palworld server
data**.

Alternatively, you can delete the `palworld-server-stack` first, then the
`palworld-domain-stack` from the [AWS Console](https://console.aws.amazon.com/cloudformation/).

Note: the Route53 A record will need to be manually reset to 192.168.1.1 in order for CDK to properly destroy the resources.  This will be fixed later.

## Troubleshooting

Set the `DEBUG` value in your [configuration](#configuration) to `true` to enable the following:

- CloudWatch Logs for the `palworld-server` ECS Container
- CloudWatch Logs for the `palworld-ecsfargate-watchdog` ECS Container

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

### The specified hosted zone does not exist

**Error Message:**

> The specified hosted zone does not exist. (Service: AmazonRoute53; Status Code: 404; Error Code: NoSuchHostedZone;...

**Cause:**

CDK is unable to find a Hosted Zone created with the domain matching your value
set to `DOMAIN_NAME`.

**Troubleshoot:**

Check the [Hosted Zones](https://console.aws.amazon.com/route53/v2/hostedzones#)
tab in the AWS Console and make sure the configuration value set for `DOMAIN_NAME`
matches the domain name found in the console.

### cdk destroy fails

Most CDK destroy failures can be resolved by running it a second time.  Other reasons may include:

- Did you reset the Route53 A record back to 192.168.1.1?  This is a temporary problem but currently required.  If you attempted destroy before doing this then just delete the record and run destroy again.
- Is your task still running?
- Any manual changes in the console may require manual deletion or changeback for destroy to work properly

  [AWS CDK]: <https://aws.amazon.com/cdk/>
  [Open an AWS Account]: <https://aws.amazon.com/premiumsupport/knowledge-center/create-and-activate-aws-account/>
  [Install AWS CLI]: <https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>
  [Create an Admin IAM User]: <https://docs.aws.amazon.com/IAM/latest/UserGuide/getting-started_create-admin-group.html>
  [configure it]: <https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html>
  [Create a public hosted zone]: <https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html>
  [Change the DNS servers]: <https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/migrate-dns-domain-inactive.html#migrate-dns-update-domain-inactive>
  [NodeJS]: <https://nodejs.org/en/download/>
  [Git]: <https://git-scm.com/download/win>
  [Usage and Customization]: <https://github.com/doctorray117/palworld-ondemand#usage-and-customization>
  [palworld java docker]: https://hub.docker.com/r/itzg/palworld-server
  [palworld bedrock docker]: https://hub.docker.com/r/itzg/palworld-bedrock-server
