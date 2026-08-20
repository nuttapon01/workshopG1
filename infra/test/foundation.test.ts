import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EcrStack } from '../lib/ecr-stack';
import { NetworkStack } from '../lib/network-stack';
import { VPC_CIDR } from '../lib/config';
import { TEST_ENV, TEST_NAMES } from './fixtures';

function synth() {
  const app = new cdk.App();
  const ecr = new EcrStack(app, 'TestEcr', { env: TEST_ENV, names: TEST_NAMES });
  const network = new NetworkStack(app, 'TestNetwork', { env: TEST_ENV, names: TEST_NAMES });
  return {
    ecr: Template.fromStack(ecr),
    network: Template.fromStack(network),
  };
}

describe('EcrStack', () => {
  const { ecr } = synth();

  it('makes image tags immutable', () => {
    // Every image is tagged with its git SHA. A mutable tag would break the
    // link between a running task and the commit it was built from, and make
    // rollback unreliable.
    ecr.hasResourceProperties('AWS::ECR::Repository', {
      ImageTagMutability: 'IMMUTABLE',
    });
  });

  it('scans images on push', () => {
    ecr.hasResourceProperties('AWS::ECR::Repository', {
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  it('encrypts the repository at rest with at least AES256', () => {
    // ECR encrypts at rest unconditionally; AES256 is the service default and
    // cannot be turned off. CDK therefore emits no EncryptionConfiguration when
    // AES256 is requested, so the meaningful assertion is that nothing has
    // downgraded it — i.e. the property is either absent (default AES256) or
    // explicitly AES256/KMS.
    const repos = ecr.findResources('AWS::ECR::Repository');
    const encryption = Object.values(repos)[0].Properties.EncryptionConfiguration;

    if (encryption !== undefined) {
      expect(['AES256', 'KMS']).toContain(encryption.EncryptionType);
    }
  });

  it('expires all but the 10 most recent images', () => {
    const repos = ecr.findResources('AWS::ECR::Repository');
    const policyText = Object.values(repos)[0].Properties.LifecyclePolicy.LifecyclePolicyText;

    expect(JSON.parse(policyText).rules[0].selection.countNumber).toBe(10);
  });

  it('publishes the repository URI to Parameter Store', () => {
    ecr.hasResourceProperties('AWS::SSM::Parameter', {
      Name: TEST_NAMES.ssm.ecrRepositoryUri,
    });
  });

  it('namespaces the repository name by deployer', () => {
    // The AWS account is shared between workshop groups. An unprefixed
    // repository name is the difference between two groups having their own
    // registry and one group silently pushing into the other's.
    ecr.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: TEST_NAMES.ecrRepository,
    });

    expect(TEST_NAMES.ecrRepository).toBe('test-group/pointhub');
  });
});

describe('NetworkStack', () => {
  const { network } = synth();

  it('provisions no NAT gateway', () => {
    // The single most expensive thing this architecture could accidentally
    // acquire: about USD 33/month, more than everything else combined. Fargate
    // tasks reach ECR through the internet gateway instead, and RDS needs no
    // egress at all. Asserted so a future subnet change cannot quietly add one.
    network.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  it('spans two availability zones', () => {
    // 4 subnets = 2 public + 2 isolated. RDS requires at least two AZs for its
    // subnet group even when running single-AZ.
    network.resourceCountIs('AWS::EC2::Subnet', 4);
  });

  it('keeps the database tier free of any route off the VPC', () => {
    // Isolated subnets get a route table with no 0.0.0.0/0 entry. Public
    // subnets get exactly one each, to the internet gateway.
    const routes = network.findResources('AWS::EC2::Route');
    const defaultRoutes = Object.values(routes).filter(
      (r) => r.Properties?.DestinationCidrBlock === '0.0.0.0/0'
    );

    expect(defaultRoutes).toHaveLength(2);
    for (const route of defaultRoutes) {
      expect(route.Properties.GatewayId).toBeDefined();
      expect(route.Properties.NatGatewayId).toBeUndefined();
    }
  });

  it('records network traffic in flow logs', () => {
    network.hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'VPC',
      TrafficType: 'ALL',
    });
  });

  it('reaches Secrets Manager and CloudWatch Logs over interface endpoints', () => {
    // Without these the migration Lambda — isolated, no NAT — cannot read the
    // database password or emit a log line.
    network.resourceCountIs('AWS::EC2::VPCEndpoint', 2);

    for (const service of ['secretsmanager', 'logs']) {
      network.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        VpcEndpointType: 'Interface',
        PrivateDnsEnabled: true,
        ServiceName: Match.stringLikeRegexp(service),
      });
    }
  });

  it('places each interface endpoint in exactly one AZ', () => {
    // PrivateLink bills per endpoint per AZ. Two endpoints across two AZs would
    // be four billable interfaces, which approaches the cost of the NAT gateway
    // this design deliberately omits.
    const endpoints = network.findResources('AWS::EC2::VPCEndpoint');

    expect(Object.keys(endpoints)).toHaveLength(2);
    for (const endpoint of Object.values(endpoints)) {
      expect(endpoint.Properties.SubnetIds).toHaveLength(1);
    }
  });

  it('restricts endpoint ingress to the VPC range and nothing wider', () => {
    const groups = network.findResources('AWS::EC2::SecurityGroup');
    const endpointGroup = Object.values(groups).find((g) =>
      (g.Properties?.GroupDescription ?? '').includes('interface endpoints')
    );

    expect(endpointGroup).toBeDefined();

    const ingress = endpointGroup!.Properties.SecurityGroupIngress;
    expect(ingress).toHaveLength(1);
    expect(ingress[0].CidrIp).toBe(VPC_CIDR);
    expect(ingress[0].FromPort).toBe(443);
    expect(ingress[0].ToPort).toBe(443);
  });

  it('never exposes an endpoint to 0.0.0.0/0', () => {
    const groups = network.findResources('AWS::EC2::SecurityGroup');

    for (const group of Object.values(groups)) {
      for (const rule of group.Properties?.SecurityGroupIngress ?? []) {
        expect(rule.CidrIp).not.toBe('0.0.0.0/0');
      }
    }
  });

  it('publishes the VPC id to a deployer-scoped Parameter Store path', () => {
    network.hasResourceProperties('AWS::SSM::Parameter', {
      Name: TEST_NAMES.ssm.vpcId,
    });

    expect(TEST_NAMES.ssm.vpcId).toBe('/test-group/prod/vpc-id');
  });

  it('namespaces the VPC and flow log group by deployer', () => {
    network.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: TEST_NAMES.vpcFlowLogGroup,
    });

    const vpcs = network.findResources('AWS::EC2::VPC');
    const nameTag = Object.values(vpcs)[0].Properties.Tags.find(
      (t: { Key: string }) => t.Key === 'Name'
    );

    expect(nameTag.Value).toBe(TEST_NAMES.vpc);
  });
});
