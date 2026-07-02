import * as path from 'path';
import {
  Stack,
  StackProps,
  aws_ec2 as ec2,
  aws_efs as efs,
  aws_iam as iam,
  aws_ecs as ecs,
  aws_logs as logs,
  aws_sns as sns,
  RemovalPolicy,
  Arn,
  ArnFormat,
} from 'aws-cdk-lib';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { constants } from './constants';
import { DiscordNotificationForwarder } from './discord-notification-forwarder';
import { SSMParameterReader } from './ssm-parameter-reader';
import { StackConfig } from './types';
//import { getPalworldServerConfig, isDockerInstalled } from './util';
import { getPalworldServerConfig } from './util';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';

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

    const hostedZoneId = new SSMParameterReader(
      this,
      'Route53HostedZoneIdReader',
      {
        parameterName: constants.HOSTED_ZONE_SSM_PARAMETER,
        region: constants.DOMAIN_STACK_REGION,
      }
    ).getParameterValue();

    // Define SNS Topic for watchdog notifications (startup/shutdown)
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

    // const image = new DockerImageAsset(this, 'CDKDockerImage', {
    //   directory: path.join(__dirname, '../../palworld-ecsfargate-watchdog/'),
    //   platform: Platform.LINUX_AMD64,
    //   // buildArgs
    //   buildArgs: {
    //     RCONPASSWORD: config.palworld.adminPassword,
    //   },
    // });

    //const containerImage = ecs.ContainerImage.fromDockerImageAsset(image);

    const watchdogContainer = new ecs.ContainerDefinition(
      this,
      'WatchDogContainer',
      {
        containerName: constants.WATCHDOG_SERVER_CONTAINER_NAME,
        // image: isDockerInstalled()
        //   ? containerImage
        //   : ecs.ContainerImage.fromRegistry(
        //       'doctorray/minecraft-ecsfargate-watchdog'
        //     ),
        image: ecs.ContainerImage.fromRegistry(
          'coni524/palworld-ecsfargate-watchdog'
        ),
        essential: true,
        taskDefinition: taskDefinition,
        environment: {
          CLUSTER: constants.CLUSTER_NAME,
          SERVICE: constants.SERVICE_NAME,
          DNSZONE: hostedZoneId,
          SERVERNAME: `${config.subdomainPart}.${config.domainName}`,
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
     * Add service control policy to the Discord interactions lambda from the
     * domain stack
     */
    const discordLambdaRoleArn = new SSMParameterReader(
      this,
      'discordLambdaRoleArn',
      {
        parameterName: constants.DISCORD_LAMBDA_ROLE_ARN_SSM_PARAMETER,
        region: constants.DOMAIN_STACK_REGION,
      }
    ).getParameterValue();
    const discordLambdaRole = iam.Role.fromRoleArn(
      this,
      'DiscordLambdaRole',
      discordLambdaRoleArn
    );
    serviceControlPolicy.attachToRole(discordLambdaRole);

    /**
     * This policy gives permission to our ECS task to update the A record
     * associated with our minecraft server. Retrieve the hosted zone identifier
     * from Route 53 and place it in the Resource line within this policy.
     */
    const iamRoute53Policy = new iam.Policy(this, 'IamRoute53Policy', {
      statements: [
        new iam.PolicyStatement({
          sid: 'AllowEditRecordSets',
          effect: iam.Effect.ALLOW,
          actions: [
            'route53:GetHostedZone',
            'route53:ChangeResourceRecordSets',
            'route53:ListResourceRecordSets',
          ],
          resources: [`arn:aws:route53:::hostedzone/${hostedZoneId}`],
        }),
      ],
    });
    iamRoute53Policy.attachToRole(ecsTaskRole);
  }
}
