#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { PalworldStack } from '../lib/palworld-stack';
import { DomainStack } from '../lib/domain-stack';
import { BillingAlertStack } from '../lib/billingalert-stack';
import { constants } from '../lib/constants';
import { resolveConfig } from '../lib/config';

const app = new cdk.App();

const config = resolveConfig();

if (!config.domainName) {
  throw new Error('Missing required `DOMAIN_NAME` in .env file, please rename\
    `.env.sample` to `.env` and add your domain name.');
}

const domainStack = new DomainStack(app, 'palworld-domain-stack', {
  env: {
    /**
     * Because we are relying on Route 53+CloudWatch to invoke the Lambda function,
     * it _must_ reside in the N. Virginia (us-east-1) region.
     */
    region: constants.DOMAIN_STACK_REGION,
    /* Account must be specified to allow for hosted zone lookup */
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  config,
});

const billingAlertStack = new BillingAlertStack(app, 'billing-alert-stack', {
  env: {
    /**
     * To access Billing information, Must reside in the Virginia (us-east-1) region.
     */
    region: constants.DOMAIN_STACK_REGION,    /* Account must be specified to allow for VPC lookup */
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  config,
});

billingAlertStack.addDependency(domainStack);

const palworldStack = new PalworldStack(app, 'palworld-server-stack', {
  env: {
    region: config.serverRegion,
    /* Account must be specified to allow for VPC lookup */
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
  config,
});

palworldStack.addDependency(domainStack);
palworldStack.addDependency(billingAlertStack);