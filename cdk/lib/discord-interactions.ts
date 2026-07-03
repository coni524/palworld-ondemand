import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  Stack,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_iam as iam,
  Duration,
  RemovalPolicy,
  Arn,
  ArnFormat,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { constants } from './constants';
import { StackConfig } from './types';

interface DiscordInteractionsProps {
  config: Readonly<StackConfig>;
}

/**
 * Lambda that receives Discord slash-command interactions through its
 * Function URL, verifies the Ed25519 signature, and scales the ECS
 * service to 1. It answers within Discord's 3-second limit by returning
 * a deferred response and invoking itself asynchronously to do the ECS
 * calls, so the self-invoke policy below needs the function ARN ahead of
 * time — hence the fixed function name.
 */
export class DiscordInteractions extends Construct {
  public readonly handler: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: DiscordInteractionsProps) {
    super(scope, id);

    const { config } = props;

    const interactionsLambdaDir = path.resolve(
      __dirname,
      '../../lambda/discord_interactions'
    );
    /**
     * discord-interactions depends on PyNaCl, which ships a compiled
     * extension, so dependencies are installed explicitly for the Lambda
     * platform (x86_64). Local bundling runs plain pip; the Docker image is
     * only a fallback for machines without a usable python3/pip.
     */
    const pipInstall =
      'pip install -r requirements.txt --target "{}"' +
      ' --platform manylinux2014_x86_64 --implementation cp' +
      ' --python-version 3.13 --only-binary=:all:';

    this.handler = new lambda.Function(this, 'Function', {
      functionName: constants.DISCORD_INTERACTIONS_LAMBDA_NAME,
      code: lambda.Code.fromAsset(interactionsLambdaDir, {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash',
            '-c',
            `${pipInstall.replace('{}', '/asset-output')} && cp lambda_function.py /asset-output/`,
          ],
          local: {
            tryBundle(outputDir: string): boolean {
              try {
                execSync(`python3 -m ${pipInstall.replace('{}', outputDir)}`, {
                  cwd: interactionsLambdaDir,
                  stdio: 'inherit',
                });
              } catch {
                return false;
              }
              fs.copyFileSync(
                path.join(interactionsLambdaDir, 'lambda_function.py'),
                path.join(outputDir, 'lambda_function.py')
              );
              return true;
            },
          },
        },
      }),
      handler: 'lambda_function.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      timeout: Duration.seconds(30),
      /**
       * CPU scales with memory, and this handler must answer Discord
       * within 3 seconds even on a cold start; 128 MB took ~2.7s.
       */
      memorySize: 512,
      environment: {
        CLUSTER: constants.CLUSTER_NAME,
        SERVICE: constants.SERVICE_NAME,
        /* The public key is not a secret; it only verifies signatures. */
        DISCORD_PUBLIC_KEY: config.discord.publicKey,
        DISCORD_GUILD_ID: config.discord.guildId,
      },
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });

    this.handler.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'AllowAsyncSelfInvoke',
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [
          Arn.format(
            {
              service: 'lambda',
              resource: 'function',
              resourceName: constants.DISCORD_INTERACTIONS_LAMBDA_NAME,
              arnFormat: ArnFormat.COLON_RESOURCE_NAME,
            },
            Stack.of(this)
          ),
        ],
      })
    );

    /**
     * Discord signs every request with Ed25519 and the handler rejects
     * anything unsigned, so the URL itself needs no IAM auth.
     */
    this.functionUrl = this.handler.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });
  }
}
