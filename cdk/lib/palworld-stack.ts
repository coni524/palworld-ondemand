import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_efs as efs,
  aws_iam as iam,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_sns as sns,
  CfnOutput,
  RemovalPolicy,
  Arn,
  ArnFormat,
} from 'aws-cdk-lib';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { BillingAlert } from './billing-alert';
import { constants } from './constants';
import { DiscordInteractions } from './discord-interactions';
import { DiscordNotificationForwarder } from './discord-notification-forwarder';
import { StackConfig } from './types';
import { getPalworldServerConfig } from './util';

interface PalworldStackProps extends StackProps {
  config: Readonly<StackConfig>;
}

export class PalworldStack extends Stack {
  constructor(scope: Construct, id: string, props: PalworldStackProps) {
    super(scope, id, props);

    const { config } = props;

    const vpc = config.vpcId
      ? ec2.Vpc.fromLookup(this, 'Vpc', { vpcId: config.vpcId })
      : new ec2.Vpc(this, 'Vpc', {
          maxAzs: 3,
          natGateways: 0,
        });

    const fileSystem = new efs.FileSystem(this, 'FileSystem', {
      vpc,
      removalPolicy: RemovalPolicy.SNAPSHOT,
    });

    const accessPoint = new efs.AccessPoint(this, 'AccessPoint', {
      fileSystem,
      path: '/palworld',
      posixUser: {
        uid: '1000',
        gid: '1000',
      },
      createAcl: {
        ownerGid: '1000',
        ownerUid: '1000',
        permissions: '0755',
      },
    });

    const efsReadWriteDataPolicy = new iam.Policy(this, 'DataRWPolicy', {
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowReadWriteOnEFS',
          effect: iam.Effect.ALLOW,
          actions: [
            'elasticfilesystem:ClientMount',
            'elasticfilesystem:ClientWrite',
            'elasticfilesystem:DescribeFileSystems',
          ],
          resources: [fileSystem.fileSystemArn],
          conditions: {
            StringEquals: {
              'elasticfilesystem:AccessPointArn': accessPoint.accessPointArn,
            },
          },
        }),
      ],
    });

    const ecsTaskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Palworld ECS task role',
    });

    efsReadWriteDataPolicy.attachToRole(ecsTaskRole);

    const cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: constants.CLUSTER_NAME,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED, // TODO: Add config for container insights
      enableFargateCapacityProviders: true,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'TaskDefinition',
      {
        taskRole: ecsTaskRole,
        memoryLimitMiB: config.taskMemory,
        cpu: config.taskCpu,
        volumes: [
          {
            name: constants.ECS_VOLUME_NAME,
            efsVolumeConfiguration: {
              fileSystemId: fileSystem.fileSystemId,
              transitEncryption: 'ENABLED',
              authorizationConfig: {
                accessPointId: accessPoint.accessPointId,
                iam: 'ENABLED',
              },
            },
          },
        ],
        runtimePlatform: {
          // The Palworld server binary is x86_64-only (ARM64 would need Box64
          // emulation) and FARGATE_SPOT does not support ARM64, so the task is
          // fixed to x86_64 on Spot.
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
        },
      }
    );

    const palworldServerConfig = getPalworldServerConfig();

    const palworldServerContainer = new ecs.ContainerDefinition(
      this,
      'ServerContainer',
      {
        containerName: constants.MC_SERVER_CONTAINER_NAME,
        image: ecs.ContainerImage.fromRegistry(palworldServerConfig.image),
        portMappings: [
          {
            containerPort: palworldServerConfig.queryPort,
            hostPort: palworldServerConfig.queryPort,
            protocol: palworldServerConfig.protocol,
          },
          {
            containerPort: palworldServerConfig.gamePort,
            hostPort: palworldServerConfig.gamePort,
            protocol: palworldServerConfig.protocol,
          },
        ],
        essential: false,
        taskDefinition,
        environment: {
          ADMIN_PASSWORD: config.palworld.adminPassword,
          SERVER_PASSWORD: config.palworld.serverPassword,
          // The watchdog polls player counts via the official REST API
          // (localhost only; the port is not exposed in the security group)
          REST_API_ENABLED: 'true',
        },
        logging: config.debug
          ? new ecs.AwsLogDriver({
              logRetention: logs.RetentionDays.THREE_DAYS,
              streamPrefix: constants.MC_SERVER_CONTAINER_NAME,
            })
          : undefined,
      }
    );

    palworldServerContainer.addMountPoints({
      containerPath: '/palworld/Pal/Saved',
      sourceVolume: constants.ECS_VOLUME_NAME,
      readOnly: false,
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(
      this,
      'ServiceSecurityGroup',
      {
        vpc,
        description: 'Security group for Palworld on-demand',
      }
    );

    serviceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(palworldServerConfig.queryPort),
      'Allow inbound traffic to Query Port'
    );
    serviceSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.udp(palworldServerConfig.gamePort),
      'Allow inbound traffic to Game Port'
    );

    const palworldServerService = new ecs.FargateService(
      this,
      'FargateService',
      {
        cluster,
        capacityProviderStrategies: [
          {
            capacityProvider: 'FARGATE_SPOT',
            weight: 1,
            base: 1,
          },
        ],
        taskDefinition: taskDefinition,
        platformVersion: ecs.FargatePlatformVersion.LATEST,
        serviceName: constants.SERVICE_NAME,
        desiredCount: 0,
        assignPublicIp: true,
        securityGroups: [serviceSecurityGroup],
        enableExecuteCommand: true,
      }
    );

    /* Allow access to EFS from Fargate service security group */
    fileSystem.connections.allowDefaultPortFrom(
      palworldServerService.connections
    );

    // Topic for the watchdog (startup/shutdown) and billing notifications
    const snsTopic = new sns.Topic(this, 'PalworldServerSnsTopic');
    snsTopic.grantPublish(ecsTaskRole);

    // Forward notifications published to the topic to the Discord webhook
    const notificationForwarder = new DiscordNotificationForwarder(
      this,
      'DiscordNotificationForwarder'
    );
    snsTopic.addSubscription(
      new subscriptions.LambdaSubscription(notificationForwarder.handler)
    );

    new BillingAlert(this, 'BillingAlert', { config, topic: snsTopic });

    const watchdogContainer = new ecs.ContainerDefinition(
      this,
      'WatchDogContainer',
      {
        containerName: constants.WATCHDOG_SERVER_CONTAINER_NAME,
        image: ecs.ContainerImage.fromRegistry(
          'coni524/palworld-ecsfargate-watchdog'
        ),
        essential: true,
        taskDefinition: taskDefinition,
        environment: {
          CLUSTER: constants.CLUSTER_NAME,
          SERVICE: constants.SERVICE_NAME,
          SNSTOPIC: snsTopic.topicArn,
          STARTUPMIN: config.startupMinutes,
          SHUTDOWNMIN: config.shutdownMinutes,
          ADMIN_PASSWORD: config.palworld.adminPassword,
        },
        logging: config.debug
          ? new ecs.AwsLogDriver({
              logRetention: logs.RetentionDays.THREE_DAYS,
              streamPrefix: constants.WATCHDOG_SERVER_CONTAINER_NAME,
            })
          : undefined,
      }
    );

    const serviceControlPolicy = new iam.Policy(this, 'ServiceControlPolicy', {
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowAllOnServiceAndTask',
          effect: iam.Effect.ALLOW,
          actions: ['ecs:*'],
          resources: [
            palworldServerService.serviceArn,
            /* arn:aws:ecs:<region>:<account_number>:task/palworld/* */
            Arn.format(
              {
                service: 'ecs',
                resource: 'task',
                resourceName: `${constants.CLUSTER_NAME}/*`,
                arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
              },
              this
            ),
          ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['ec2:DescribeNetworkInterfaces'],
          resources: ['*'],
        }),
      ],
    });

    serviceControlPolicy.attachToRole(ecsTaskRole);

    /**
     * Lambda that starts the server from the Discord /start slash command.
     * Living in the same stack as the service, it gets the service-control
     * policy attached to its role directly.
     */
    const discordInteractions = new DiscordInteractions(
      this,
      'DiscordInteractions',
      { config }
    );
    serviceControlPolicy.attachToRole(discordInteractions.handler.role!);

    new CfnOutput(this, 'DiscordInteractionsEndpointUrl', {
      description:
        'Set this as the Interactions Endpoint URL of the Discord application',
      value: discordInteractions.functionUrl.url,
    });
  }
}
