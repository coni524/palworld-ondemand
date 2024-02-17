import * as path from 'path';
import {
  Stack,
  StackProps,
  Duration,
  aws_iam as iam,
  aws_sns as sns,
  aws_ssm as ssm,
} from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { constants } from './constants';
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

    // Create Lambda function
    const billingInfoLambda = new lambda.Function(this, 'BillingInfoLambda', {
      code: lambda.Code.fromAsset(
        path.resolve(__dirname, '../../lambda/billing_report')
      ),
      handler: 'lambda_function.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_11,
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

    new ssm.StringParameter(this, 'BiliingAlertSnsTopicParam', {
      allowedPattern: '.*',
      description: 'Billing SNS Topic ARN',
      parameterName: constants.BILLING_ALERT_SNS_TOPIC_SSM_PARAMETER,
      stringValue: billingAlertTopic.topicArn || '',
    });
  }
}
