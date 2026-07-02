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
  PALWORLD_DOCKER_IMAGE: 'thijsvanloef/palworld-server-docker',
  /* Fixed Palworld ports (UDP). The game port is what players connect to and
     what the watchdog announces; the query port serves the Steam server
     browser. */
  GAME_PORT: 8211,
  QUERY_PORT: 27015,
}
