#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PalworldStack } from '../lib/palworld-stack';
import { resolveConfig } from '../lib/config';

const app = new cdk.App();

const config = resolveConfig();

new PalworldStack(app, 'palworld-server-stack', {
  env: {
    region: config.serverRegion,
    /* Account must be specified to allow for VPC lookup */
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  config,
});
