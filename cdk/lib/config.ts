import * as dotenv from 'dotenv';
import * as path from 'path';
import { PalworldImageEnv, StackConfig } from './types';
import { stringAsBoolean } from './util';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const resolveConfig = (): StackConfig => ({
  domainName: process.env.DOMAIN_NAME || '',
  subdomainPart: process.env.SUBDOMAIN_PART || 'palworld',
  serverRegion: process.env.SERVER_REGION || 'us-east-1',
  shutdownMinutes: process.env.SHUTDOWN_MINUTES || '20',
  startupMinutes: process.env.STARTUP_MINUTES || '10',
  useFargateSpot: stringAsBoolean(process.env.USE_FARGATE_SPOT) || false,
  taskCpu: +(process.env.TASK_CPU || 1024),
  taskMemory: +(process.env.TASK_MEMORY || 2048),
  vpcId: process.env.VPC_ID || '',
  //snsEmailAddress: process.env.SNS_EMAIL_ADDRESS || '',
  twilio: {
    phoneFrom: process.env.TWILIO_PHONE_FROM || '',
    phoneTo: process.env.TWILIO_PHONE_TO || '',
    accountId: process.env.TWILIO_ACCOUNT_ID || '',
    authCode: process.env.TWILIO_AUTH_CODE || '',
  },
  slack: {
    slackChannelName: process.env.SLACK_CHANNEL_NAME || 'Palworld',
    slackWorkspaceId: process.env.SLACK_WORKSPACE_ID || '',
    slackChannelId: process.env.SLACK_CHANNEL_ID || '',
  },
  palworld: {
    adminPassword: process.env.ADMIN_PASSWORD || 'worldofpaladmin',
    serverPassword: process.env.SERVER_PASSWORD || 'worldofpal',
  },
  billingAlertInterval: +(process.env.BILLING_ALERT_INTERVAL || 6),
  billingAlert: stringAsBoolean(process.env.BILLING_ALERT) || false,
  debug: stringAsBoolean(process.env.DEBUG) || false,
});
