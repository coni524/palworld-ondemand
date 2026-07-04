import * as path from 'path';
import {
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_logs as logs,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { constants } from './constants';
import { StackConfig } from './types';

interface RestApiProxyProps {
  config: Readonly<StackConfig>;
  vpc: ec2.IVpc;
}

/**
 * VPC-internal Lambda that reaches the Fargate task's private `IP:8212` and
 * relays a single Palworld REST API call, returning the response as its own
 * return value. It has no Function URL and needs no internet egress, so it adds
 * no standing cost: the receiver Lambda (outside the VPC) invokes it
 * synchronously and hands it the private IP it read from SSM.
 *
 * Keeping the call here — rather than opening 8212 to the internet — means the
 * REST API's Basic-auth-over-plain-HTTP surface is never exposed: the port is
 * only reachable from this function's security group, and the admin password
 * lives only in this function's environment.
 */
export class RestApiProxy extends Construct {
  public readonly handler: lambda.Function;
  public readonly securityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: RestApiProxyProps) {
    super(scope, id);

    const { config, vpc } = props;

    // Outbound-only: the function initiates connections to the task and never
    // receives any. No ingress rules; default egress is fine (the paired
    // ingress rule on the task's security group is what actually gates 8212).
    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Palworld REST API proxy Lambda',
      allowAllOutbound: true,
    });

    this.handler = new lambda.Function(this, 'Function', {
      // Pure standard library (urllib), so no bundling/pip step is needed.
      code: lambda.Code.fromAsset(
        path.resolve(__dirname, '../../lambda/rest_api_proxy')
      ),
      handler: 'lambda_function.lambda_handler',
      runtime: lambda.Runtime.PYTHON_3_13,
      timeout: Duration.seconds(20),
      // Matches the receiver Lambda; keeps cold starts short.
      memorySize: 512,
      vpc,
      // The task runs in a public subnet (assignPublicIp), but intra-VPC
      // traffic to its private IP is local-routed, so the proxy sits in the
      // isolated subnets (the VPC has natGateways: 0, so its private subnets
      // are isolated) and never needs a public IP or NAT.
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.securityGroup],
      environment: {
        ADMIN_PASSWORD: config.palworld.adminPassword,
        REST_API_PORT: String(constants.REST_API_PORT),
      },
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
    });
  }
}
