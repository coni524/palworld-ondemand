export const constants = {
  CLUSTER_NAME: 'palworld',
  SERVICE_NAME: 'palworld-server',
  MC_SERVER_CONTAINER_NAME: 'palworld-server',
  WATCHDOG_SERVER_CONTAINER_NAME: 'palworld-ecsfargate-watchdog',
  ECS_VOLUME_NAME: 'data',
  /* Fixed function name so the self-invoke IAM statement can reference the
     ARN without creating a circular dependency on the function itself. */
  DISCORD_INTERACTIONS_LAMBDA_NAME: 'palworld-discord-interactions',
  /* Created manually as a SecureString (CloudFormation cannot create one) in
     the server region; holds the Discord channel webhook URL used for
     notifications. */
  DISCORD_WEBHOOK_URL_SSM_PARAMETER: '/palworld/discord/webhook-url',
  /* Written at runtime by the watchdog (plain String) with the running task's
     private IP, and read by the receiver Lambda so it can tell the VPC-internal
     proxy Lambda which address to reach for the REST API. */
  PRIVATE_IP_SSM_PARAMETER: '/palworld/server/private-ip',
  PALWORLD_DOCKER_IMAGE: 'thijsvanloef/palworld-server-docker',
  /* Fixed Palworld ports (UDP). The game port is what players connect to and
     what the watchdog announces; the query port serves the Steam server
     browser. */
  GAME_PORT: 8211,
  QUERY_PORT: 27015,
  /* Palworld's official REST API (TCP). It listens on localhost inside the
     task; the security group only opens it to the proxy Lambda, never the
     internet. */
  REST_API_PORT: 8212,
}
