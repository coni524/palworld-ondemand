import * as path from 'path';
import {
  Duration,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_sns as sns,
} from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { StackConfig } from './types';

interface BillingAlertProps {
  config: Readonly<StackConfig>;
  /** Topic whose subscribers forward messages to the Discord webhook. */
  topic: sns.ITopic;
}

/**
 * Lambda on an EventBridge schedule that publishes the month-to-date AWS
 * cost to the notification topic. The Cost Explorer API is a global service
 * behind a single us-east-1 endpoint, which the SDK resolves from any
 * region, so this construct deploys fine in the server region.
 */
export class BillingAlert extends Construct {
  constructor(scope: Construct, id: string, props: BillingAlertProps) {
    super(scope, id);

    const { config, topic } = props;

    const billingInfoLambda = new lambda.Function(this, 'Function', {
      code: lambda.Code.fromAsset(
        path.resolve(__dirname, '../../lambda/billing_report')
      ),
      handler: 'lambda_function.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      environment: {
        SNS_TOPIC_ARN: topic.topicArn,
      },
    });

    topic.grantPublish(billingInfoLambda);

    billingInfoLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ce:GetCostAndUsage'],
        resources: ['*'],
      })
    );

    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(
        Duration.hours(config.billingAlertInterval)
      ),
      enabled: config.billingAlert,
    });
    rule.addTarget(new targets.LambdaFunction(billingInfoLambda));
  }
}
