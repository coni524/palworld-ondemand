import * as path from 'path';
import {
  Stack,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  Arn,
  ArnFormat,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { constants } from './constants';

/**
 * Lambda that forwards SNS notifications to a Discord channel webhook.
 *
 * One instance is deployed next to each SNS topic (server stack and billing
 * stack) so every subscription stays within its topic's region. The webhook
 * URL is read at runtime from SSM Parameter Store in us-east-1.
 */
export class DiscordNotificationForwarder extends Construct {
  public readonly handler: lambda.Function;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.handler = new lambda.Function(this, 'Function', {
      code: lambda.Code.fromAsset(
        path.resolve(__dirname, '../../lambda/discord_notification')
      ),
      handler: 'lambda_function.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      timeout: Duration.seconds(30),
      environment: {
        WEBHOOK_URL_PARAMETER: constants.DISCORD_WEBHOOK_URL_SSM_PARAMETER,
        SSM_REGION: constants.DOMAIN_STACK_REGION,
      },
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          Arn.format(
            {
              service: 'ssm',
              region: constants.DOMAIN_STACK_REGION,
              resource: 'parameter',
              resourceName: constants.DISCORD_WEBHOOK_URL_SSM_PARAMETER.replace(
                /^\//,
                ''
              ),
              arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
            },
            Stack.of(this)
          ),
        ],
      })
    );
  }
}
