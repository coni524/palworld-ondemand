# Palworld ECS Fargate Watchdog

`watchdog.sh` scales the ECS service back to `desiredCount: 0` when the Palworld
server is idle. It is **not** packaged as its own image: the CDK stack reads this
script at synth time and runs it inline (`bash -c <script>`) on AWS's official
AWS CLI image (`public.ecr.aws/aws-cli/aws-cli`, on ECR Public), which already
ships the `bash`, `curl` and `jq` the script needs. Nothing is installed at
container start. See the `WatchDogContainer` in `cdk/lib/palworld-stack.ts`.

## What it does

- Looks up the task's public IP (ECS task metadata → EC2 ENI) for the startup notification.
- Waits for the Palworld REST API to respond (which also means the server is up and the
  game port is bound); gives up after 10 minutes so a broken task does not run forever.
- Publishes a plain-text `IP:GAMEPORT` startup message to SNS.
- Polls player count via the REST API (`GET /v1/api/players` on `localhost:8212`, Basic
  auth with `ADMIN_PASSWORD`).
- Scales the service to 0 after `STARTUPMIN` (default 10) minutes with no first connection,
  or `SHUTDOWNMIN` (default 20) minutes after the last player disconnects.
- Traps SIGTERM (Fargate Spot interruption) and scales to 0 cleanly.

## Behavioral checklist (verify before changing)

- Shuts down after `STARTUPMIN` minutes with no connection.
- Detects a connection and stays up.
- Detects when all players have disconnected and starts the shutdown timer.
- Shuts down `SHUTDOWNMIN` minutes after the last player leaves.
- Catches SIGTERM and shuts down cleanly.
