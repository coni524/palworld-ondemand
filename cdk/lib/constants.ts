export const constants = {
  CLUSTER_NAME: 'palworld',
  SERVICE_NAME: 'palworld-server',
  MC_SERVER_CONTAINER_NAME: 'palworld-server',
  WATCHDOG_SERVER_CONTAINER_NAME: 'palworld-ecsfargate-watchdog',
  DOMAIN_STACK_REGION: 'us-east-1',
  ECS_VOLUME_NAME: 'data',
  HOSTED_ZONE_SSM_PARAMETER: 'PalworldHostedZoneID',
  DISCORD_LAMBDA_ROLE_ARN_SSM_PARAMETER: 'DiscordLambdaRoleArn',
  /* Fixed function name so the self-invoke IAM statement can reference the
     ARN without creating a circular dependency on the function itself. */
  DISCORD_INTERACTIONS_LAMBDA_NAME: 'palworld-discord-interactions',
  /* Created manually as a SecureString (CloudFormation cannot create one);
     holds the Discord channel webhook URL used for notifications. */
  DISCORD_WEBHOOK_URL_SSM_PARAMETER: '/palworld/discord/webhook-url',
  PALWORLD_DOCKER_IMAGE: 'thijsvanloef/palworld-server-docker',
}
