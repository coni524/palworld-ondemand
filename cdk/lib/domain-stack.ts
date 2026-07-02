import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  Stack,
  StackProps,
  aws_lambda as lambda,
  aws_route53 as route53,
  aws_logs as logs,
  aws_ssm as ssm,
  aws_iam as iam,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Arn,
  ArnFormat,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { constants } from './constants';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { StackConfig } from './types';

interface DomainStackProps extends StackProps {
  config: Readonly<StackConfig>;
}

export class DomainStack extends Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    const { config } = props;

    const subdomain = `${config.subdomainPart}.${config.domainName}`;

    const rootHostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: config.domainName,
    });

    const subdomainHostedZone = new route53.HostedZone(
      this,
      'SubdomainHostedZone',
      {
        zoneName: subdomain,
      }
    );

    /* Ensure we have an existing hosted zone before creating our delegated zone */
    subdomainHostedZone.node.addDependency(rootHostedZone);

    const nsRecord = new route53.NsRecord(this, 'NSRecord', {
      zone: rootHostedZone,
      values: subdomainHostedZone.hostedZoneNameServers as string[],
      recordName: subdomain,
    });

    const aRecord = new route53.ARecord(this, 'ARecord', {
      target: {
        /**
         * The value of the record is irrelevant because it will be updated
         * every time our container launches.
         */
        values: ['192.168.1.1'],
      },
      /**
       * The low TTL is so that the DNS clients and non-authoritative DNS
       * servers won't cache the record long and you can connect quicker after
       * the IP updates.
       */
      ttl: Duration.seconds(30),
      recordName: subdomain,
      zone: subdomainHostedZone,
    });

    /* Set dependency on A record to ensure it is removed first on deletion */
    aRecord.node.addDependency(subdomainHostedZone);

    /**
     * Lambda that receives Discord slash-command interactions through its
     * Function URL, verifies the Ed25519 signature, and scales the ECS
     * service to 1. It answers within Discord's 3-second limit by returning
     * a deferred response and invoking itself asynchronously to do the ECS
     * calls, so the self-invoke policy below needs the function ARN ahead of
     * time — hence the fixed function name.
     */
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

    const interactionsLambda = new lambda.Function(
      this,
      'DiscordInteractionsLambda',
      {
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
        environment: {
          REGION: config.serverRegion,
          CLUSTER: constants.CLUSTER_NAME,
          SERVICE: constants.SERVICE_NAME,
          /* The public key is not a secret; it only verifies signatures. */
          DISCORD_PUBLIC_KEY: config.discord.publicKey,
          DISCORD_GUILD_ID: config.discord.guildId,
        },
        logGroup: new logs.LogGroup(this, 'DiscordInteractionsLambdaLogs', {
          retention: RetentionDays.THREE_DAYS,
          removalPolicy: RemovalPolicy.DESTROY,
        }),
      }
    );

    interactionsLambda.addToRolePolicy(
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
            this
          ),
        ],
      })
    );

    /**
     * Discord signs every request with Ed25519 and the handler rejects
     * anything unsigned, so the URL itself needs no IAM auth.
     */
    const interactionsUrl = interactionsLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    new CfnOutput(this, 'DiscordInteractionsEndpointUrl', {
      description:
        'Set this as the Interactions Endpoint URL of the Discord application',
      value: interactionsUrl.url,
    });

    /**
     * Add the subdomain hosted zone ID to SSM since we cannot consume a cross-stack
     * references across regions.
     */
    new ssm.StringParameter(this, 'HostedZoneParam', {
      allowedPattern: '.*',
      description: 'Hosted zone ID for palworld server',
      parameterName: constants.HOSTED_ZONE_SSM_PARAMETER,
      stringValue: subdomainHostedZone.hostedZoneId,
    });

    /**
     * Add the ARN of the Discord lambda execution role to SSM so the server
     * stack can attach the ECS service-control policy after the service has
     * been created.
     */
    new ssm.StringParameter(this, 'DiscordLambdaRoleArnParam', {
      allowedPattern: '.*',
      description: 'Discord interactions Lambda execution role ARN',
      parameterName: constants.DISCORD_LAMBDA_ROLE_ARN_SSM_PARAMETER,
      stringValue: interactionsLambda.role?.roleArn || '',
    });
  }
}
