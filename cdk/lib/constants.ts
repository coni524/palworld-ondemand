export const constants = {
  CLUSTER_NAME: 'palworld',
  SERVICE_NAME: 'palworld-server',
  MC_SERVER_CONTAINER_NAME: 'palworld-server',
  WATCHDOG_SERVER_CONTAINER_NAME: 'palworld-ecsfargate-watchdog',
  DOMAIN_STACK_REGION: 'us-east-1',
  ECS_VOLUME_NAME: 'data',
  HOSTED_ZONE_SSM_PARAMETER: 'PalworldHostedZoneID',
  LAUNCHER_LAMBDA_ROLE_ARN_SSM_PARAMETER: 'LauncherLambdaRoleArn',
  LAUNCHER_LAMBDA_ARN_SSM_PARAMETER: 'LauncherLambdaArn',
  BILLING_ALERT_SNS_TOPIC_SSM_PARAMETER: 'BillingAlertSNSTopicArn',
  PALWORLD_DOCKER_IMAGE: 'thijsvanloef/palworld-server-docker',
}
