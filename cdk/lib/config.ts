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
  taskCpu: +(process.env.TASK_CPU || 1024),
  taskMemory: +(process.env.TASK_MEMORY || 2048),
  vpcId: process.env.VPC_ID || '',
  //snsEmailAddress: process.env.SNS_EMAIL_ADDRESS || '',
  discord: {
    publicKey: process.env.DISCORD_PUBLIC_KEY || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
  },
  palworld: {
    adminPassword: process.env.ADMIN_PASSWORD || 'worldofpaladmin',
    serverPassword: process.env.SERVER_PASSWORD || 'worldofpal',
  },
  billingAlertInterval: +(process.env.BILLING_ALERT_INTERVAL || 6),
  billingAlert: stringAsBoolean(process.env.BILLING_ALERT) || false,
  debug: stringAsBoolean(process.env.DEBUG) || false,
});
