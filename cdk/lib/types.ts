import type { Protocol } from 'aws-cdk-lib/aws-ecs';
import type { Port } from 'aws-cdk-lib/aws-ec2';

interface DiscordConfig {
  /**
   * **Required**. The public key of the Discord application, used to verify
   * the Ed25519 signature on incoming interactions. Found under
   * General Information in the Discord Developer Portal. Not a secret.
   *
   * @example "3717e9b6247e0a5e9db9e0e70d842c3a..."
   */
  publicKey: string;
  /**
   * **Required**. The ID of the Discord guild (server) allowed to run the
   * slash commands. The Lambda rejects interactions from any other guild.
   *
   * @example "1234567890123456789"
   */
  guildId: string;
}

interface PalworldConfig {
  /**
   * The password for the RCON connection
   * 
   * @example "PASSWORD for RCON"
   */
  adminPassword: string;
  /**
   * **Required**. The password for the Palworld server
   * 
   * @example "worldofpal"
   */
  serverPassword: string;
}

export type PalworldImageEnv = Record<string, string>;

export interface StackConfig {
  /**
   * The AWS region to deploy your minecraft server in.
   *
   * @default "us-east-1"
   */
  serverRegion: string;
  /**
   * Number of minutes to wait for a connection after starting before terminating (optional, default 10)
   *
   * @default "10"
   */
  startupMinutes: string;
  /**
   * Number of minutes to wait after the last client disconnects before terminating (optional, default 20)
   *
   * @default "20"
   */
  shutdownMinutes: string;
  /**
   * The number of cpu units used by the task running the Minecraft server.
   *
   * Valid values, which determines your range of valid values for the memory parameter:
   *
   * 256 (.25 vCPU) - Available memory values: 0.5GB, 1GB, 2GB
   *
   * 512 (.5 vCPU) - Available memory values: 1GB, 2GB, 3GB, 4GB
   *
   * 1024 (1 vCPU) - Available memory values: 2GB, 3GB, 4GB, 5GB, 6GB, 7GB, 8GB
   *
   * 2048 (2 vCPU) - Available memory values: Between 4GB and 16GB in 1GB increments
   *
   * 4096 (4 vCPU) - Available memory values: Between 8GB and 30GB in 1GB increments
   *
   * @default 1024 1 vCPU
   */
  taskCpu: number;
  /**
   * The amount (in MiB) of memory used by the task running the Minecraft server.
   *
   * 512 (0.5 GB), 1024 (1 GB), 2048 (2 GB) - Available cpu values: 256 (.25 vCPU)
   *
   * 1024 (1 GB), 2048 (2 GB), 3072 (3 GB), 4096 (4 GB) - Available cpu values: 512 (.5 vCPU)
   *
   * 2048 (2 GB), 3072 (3 GB), 4096 (4 GB), 5120 (5 GB), 6144 (6 GB), 7168 (7 GB), 8192 (8 GB) - Available cpu values: 1024 (1 vCPU)
   *
   * Between 4096 (4 GB) and 16384 (16 GB) in increments of 1024 (1 GB) - Available cpu values: 2048 (2 vCPU)
   *
   * Between 8192 (8 GB) and 30720 (30 GB) in increments of 1024 (1 GB) - Available cpu values: 4096 (4 vCPU)
   *
   * @default 2048 2 GB
   */
  taskMemory: number;
  /**
   * The ID of an already existing VPC to deploy the server to. When this valueis not set, a new VPC is automatically created by default.
   */
  vpcId: string;
  /**
   * The email address you would like to receive notifications at.
   *
   * If this value is specified, an SNS topic is created and you will receive
   * email notifications each time the minecraft server is launched and ready.
   */
  //snsEmailAddress: string;
  discord: DiscordConfig;
  palworld: PalworldConfig;
  /**
   * Setting Billin Alert Interval
   * 
   * Hourly billing alert interval
   */
  billingAlert: boolean;
  billingAlertInterval: number;

  /**
   * Setting to `true` enables debug mode.
   *
   * This will enable the following:
   * - CloudWatch Logs for the `minecraft-server` ECS Container
   * - CloudWatch Logs for the `minecraft-ecsfargate-watchdog` ECS Container
   */
  debug: boolean;
}

export interface PalworldEditionConfig {
  /**
   * Name of the docker image to pull for the Minecraft server
   *
   * @example 'itzg/minecraft-server'
   */
  image: string;
  /**
   * Port number to run the Minecraft server on
   */
  queryPort: number;
  /**
   * Port number to run the Minecraft server on
   */
  gamePort: number;
  /**
   * Protocol for the Minecraft server
   */
  protocol: Protocol;
  /**
   * The ingress rule port to be used for the service security group
   */
  ingressRuleQueryPort: Port;
  ingressRuleGamePort: Port;
}
