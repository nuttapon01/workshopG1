import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ResourceNames, VPC_CIDR } from './config';

export interface NetworkStackProps extends cdk.StackProps {
  readonly names: ResourceNames;
}

/**
 * VPC and the endpoints that let private workloads reach AWS APIs.
 *
 * Layout:
 *   public subnets   — ALB, and the Fargate tasks themselves
 *   isolated subnets — RDS, and the migration Lambda
 *
 * There is deliberately NO NAT gateway. At roughly USD 33/month it would have
 * cost more than every other resource in this architecture combined, and nothing
 * here needs generic outbound internet access:
 *
 *   - Fargate tasks sit in public subnets with `assignPublicIp`, so they reach
 *     ECR and CloudWatch Logs through the internet gateway. They are still not
 *     reachable from outside, because their security group only accepts traffic
 *     from the load balancer's security group. "Public subnet" describes a route
 *     table, not an access policy.
 *   - RDS sits in isolated subnets with no route off the VPC at all.
 *   - The migration Lambda needs exactly two AWS APIs, reached through the
 *     interface endpoints below.
 */
export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { names } = props;

    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: names.vpc,
      ipAddresses: ec2.IpAddresses.cidr(VPC_CIDR),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
      // Resolve RDS endpoints to private addresses from inside the VPC.
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // -----------------------------------------------------------------------
    // Flow logs
    // -----------------------------------------------------------------------
    // With the Fargate tasks in public subnets, flow logs are the only record of
    // what actually tried to reach them. Rejected traffic in particular is what
    // tells you whether the security groups are doing their job.
    //
    // Two weeks of retention keeps this at a few cents a month at workshop
    // traffic levels.
    const flowLogGroup = new logs.LogGroup(this, 'VpcFlowLogGroup', {
      logGroupName: names.vpcFlowLogGroup,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // -----------------------------------------------------------------------
    // Interface endpoints for the migration Lambda
    // -----------------------------------------------------------------------
    // A Lambda attached to a VPC loses the service-managed internet path, and a
    // Lambda cannot hold a public IP, so putting it in a public subnet would not
    // help. Without a NAT gateway these two endpoints are the only way it can
    // reach the APIs it needs.
    //
    // PrivateLink bills per endpoint per availability zone, so spreading two
    // endpoints over two AZs would mean four billable interfaces — around USD
    // 29/month, close to the NAT gateway this design exists to avoid. Both are
    // therefore pinned to a single AZ, roughly halving that.
    //
    // The trade-off is acceptable because the only consumer is the migration
    // Lambda, which runs for a few seconds during a deployment. If that AZ is
    // impaired the deployment fails and is retried; no request traffic depends
    // on these endpoints. Private DNS still resolves for a Lambda ENI in the
    // other AZ, it just crosses an AZ boundary to get there.
    const endpointSubnets: ec2.SubnetSelection = {
      subnets: [this.vpc.isolatedSubnets[0]],
    };

    const endpointSecurityGroup = new ec2.SecurityGroup(this, 'EndpointSecurityGroup', {
      vpc: this.vpc,
      description: 'Allows VPC resources to reach interface endpoints over HTTPS',
      allowAllOutbound: false,
    });

    endpointSecurityGroup.addIngressRule(
      // The literal from config, not `this.vpc.vpcCidrBlock` — see VPC_CIDR.
      ec2.Peer.ipv4(VPC_CIDR),
      ec2.Port.tcp(443),
      'HTTPS from inside the VPC'
    );

    // `open: false` on both endpoints. Left at its default of true, the
    // construct adds its own ingress rule sourced from `vpc.vpcCidrBlock` — a
    // CloudFormation token — on top of the explicit rule above. That token is
    // what cdk-nag cannot evaluate for AwsSolutions-EC23, so the check silently
    // degrades from "verified not open to the world" to "could not be
    // validated". The ingress above already grants exactly the same access.

    // Required: the migration Lambda reads the database password from here.
    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: endpointSubnets,
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
      open: false,
    });

    // Not strictly required for the migration to succeed, but without it the
    // Lambda's logs never leave the VPC — and a migration that fails silently
    // during a deployment is the worst possible thing to have to debug.
    this.vpc.addInterfaceEndpoint('CloudWatchLogsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: endpointSubnets,
      securityGroups: [endpointSecurityGroup],
      privateDnsEnabled: true,
      open: false,
    });

    // -----------------------------------------------------------------------
    // Cross-stack values
    // -----------------------------------------------------------------------
    new ssm.StringParameter(this, 'VpcIdParameter', {
      parameterName: names.ssm.vpcId,
      stringValue: this.vpc.vpcId,
      description: 'PointHub VPC id',
      tier: ssm.ParameterTier.STANDARD,
    });

    new cdk.CfnOutput(this, 'VpcId', { value: this.vpc.vpcId });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: this.vpc.publicSubnets.map((s) => s.subnetId).join(','),
    });

    new cdk.CfnOutput(this, 'IsolatedSubnetIds', {
      value: this.vpc.isolatedSubnets.map((s) => s.subnetId).join(','),
    });

    new cdk.CfnOutput(this, 'NatGatewayCount', {
      value: '0',
      description: 'Deliberately zero - see the comment in network-stack.ts',
    });
  }
}
