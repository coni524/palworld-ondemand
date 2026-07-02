import * as path from 'path';
import {
  Stack,
  StackProps,
  Duration,
  aws_iam as iam,
  aws_sns as sns,
} from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import { DiscordNotificationForwarder } from './discord-notification-forwarder';
import { StackConfig } from './types';

interface BillingAlertStackProps extends StackProps {
  config: Readonly<StackConfig>;
}

export class BillingAlertStack extends Stack {
  constructor(scope: Construct, id: string, props: BillingAlertStackProps) {
    super(scope, id, props);

    const { config } = props;

    // Create SNS topic
    const billingAlertTopic = new sns.Topic(this, 'BillingAlertTopic');

    // Forward billing reports published to the topic to the Discord webhook
    const notificationForwarder = new DiscordNotificationForwarder(
      this,
      'DiscordNotificationForwarder'
    );
    billingAlertTopic.addSubscription(
      new subscriptions.LambdaSubscription(notificationForwarder.handler)
    );

    // Create Lambda function
    const billingInfoLambda = new lambda.Function(this, 'BillingInfoLambda', {
      code: lambda.Code.fromAsset(
        path.resolve(__dirname, '../../lambda/billing_report')
      ),
      handler: 'lambda_function.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      environment: {
        SNS_TOPIC_ARN: billingAlertTopic.topicArn,
      },
    });

    // Add publish permission to the Lambda function
    billingAlertTopic.grantPublish(billingInfoLambda);

    // Add IAM policy to the Lambda function
    billingInfoLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ce:GetCostAndUsage'],
        resources: ['*'],
      })
    );

    // CloudWatch Event Rule
    const rule = new events.Rule(this, 'Rule', {
      schedule: events.Schedule.rate(Duration.hours(config.billingAlertInterval)),
      enabled: config.billingAlert,
    });
    rule.addTarget(new targets.LambdaFunction(billingInfoLambda));
  }
}
