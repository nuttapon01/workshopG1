import { describe, it, expect } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { DATABASE_NAME, POSTGRES_VERSION } from '../lib/config';
import { TEST_ENV, TEST_NAMES } from './fixtures';

function synth() {
  const app = new cdk.App();
  const network = new NetworkStack(app, 'TestNetwork', { env: TEST_ENV, names: TEST_NAMES });
  const data = new DataStack(app, 'TestData', {
    env: TEST_ENV,
    names: TEST_NAMES,
    vpc: network.vpc,
  });
  return Template.fromStack(data);
}

describe('DataStack', () => {
  const data = synth();

  describe('exposure', () => {
    it('is not publicly accessible', () => {
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        PubliclyAccessible: false,
      });
    });

    it('sits in the isolated subnets', () => {
      // The isolated tier has no route off the VPC in either direction, so this
      // is what actually keeps the ledger unreachable — PubliclyAccessible:false
      // alone would still leave it reachable from a public subnet.
      const groups = data.findResources('AWS::RDS::DBSubnetGroup');
      const subnetIds = Object.values(groups)[0].Properties.SubnetIds;

      expect(subnetIds).toHaveLength(2);
      // Asserted on the import names, which carry the subnet group they came
      // from. A public subnet here would be a silent, serious regression.
      for (const subnet of subnetIds) {
        expect(JSON.stringify(subnet)).toMatch(/isolatedSubnet/);
        expect(JSON.stringify(subnet)).not.toMatch(/publicSubnet/);
      }
    });

    it('accepts traffic only from the db-client security group, never a CIDR', () => {
      const ingress = data.findResources('AWS::EC2::SecurityGroupIngress');

      expect(Object.keys(ingress)).toHaveLength(1);

      const rule = Object.values(ingress)[0].Properties;
      expect(rule.FromPort).toBe(5432);
      expect(rule.ToPort).toBe(5432);
      // Group-to-group, so membership grants access rather than network location.
      expect(rule.SourceSecurityGroupId).toBeDefined();
      expect(rule.CidrIp).toBeUndefined();
    });

    it('does not let the database open outbound connections', () => {
      const groups = data.findResources('AWS::EC2::SecurityGroup');
      const dbGroup = Object.values(groups).find(
        (g) => g.Properties?.GroupName === TEST_NAMES.dbSecurityGroup
      );

      expect(dbGroup).toBeDefined();

      // With allowAllOutbound false, CDK emits one unreachable placeholder rule
      // (255.255.255.255/32, icmp) because a security group cannot have an empty
      // egress list. The assertion that matters is that no rule permits real
      // egress.
      const egress = dbGroup!.Properties.SecurityGroupEgress;
      expect(egress).toHaveLength(1);
      expect(egress[0].CidrIp).toBe('255.255.255.255/32');
      expect(egress[0].Description).toBe('Disallow all traffic');
    });
  });

  describe('data protection', () => {
    it('encrypts storage at rest', () => {
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        StorageEncrypted: true,
      });
    });

    it('requires TLS at the server', () => {
      // This is what makes the DB_SSL/DB_CA_PATH handling in src/db/pool.ts
      // load-bearing: with force_ssl on, a client that skips TLS cannot connect
      // at all rather than silently sending credentials in the clear.
      data.hasResourceProperties('AWS::RDS::DBParameterGroup', {
        Parameters: Match.objectLike({ 'rds.force_ssl': '1' }),
      });
    });

    it('retains backups for a week', () => {
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        BackupRetentionPeriod: 7,
      });
    });
  });

  describe('credentials', () => {
    it('generates the password in Secrets Manager', () => {
      data.resourceCountIs('AWS::SecretsManager::Secret', 1);
      data.hasResourceProperties('AWS::SecretsManager::Secret', {
        GenerateSecretString: Match.objectLike({ GenerateStringKey: 'password' }),
      });
    });

    it('never puts the password in the template', () => {
      // The whole template, as text. A generated secret must appear only as a
      // reference; a literal MasterUserPassword would be readable by anyone with
      // CloudFormation read access.
      const rendered = JSON.stringify(data.toJSON());

      expect(rendered).not.toMatch(/"MasterUserPassword"\s*:\s*"[^{]/);
    });

    it('publishes the secret ARN, not the secret value', () => {
      const params = data.findResources('AWS::SSM::Parameter');
      const secretParam = Object.values(params).find(
        (p) => p.Properties?.Name === TEST_NAMES.ssm.dbSecretArn
      );

      expect(secretParam).toBeDefined();
      // A Ref/GetAtt object, never an inline string.
      expect(typeof secretParam!.Properties.Value).toBe('object');
    });
  });

  describe('engine', () => {
    it('runs the mandated PostgreSQL 15 line', () => {
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        Engine: 'postgres',
        EngineVersion: POSTGRES_VERSION,
      });
    });

    it('creates the pointhub database on a burstable graviton instance', () => {
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        DBName: DATABASE_NAME,
        DBInstanceClass: 'db.t4g.micro',
        StorageType: 'gp3',
      });
    });
  });

  describe('cost and teardown', () => {
    it('runs single-AZ', () => {
      // Deliberate: the standby would double the largest line on the bill.
      // Acknowledged against AwsSolutions-RDS3 with that reasoning.
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        MultiAZ: false,
      });
    });

    it('can be destroyed in one command', () => {
      // The account is shared. Leaving a billable instance behind is a more
      // likely failure here than an accidental delete.
      data.hasResource('AWS::RDS::DBInstance', {
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        DeletionProtection: false,
      });
    });

    it('does not enable Performance Insights', () => {
      // Chargeable beyond the 7-day free tier, and nothing here reads it.
      data.hasResourceProperties('AWS::RDS::DBInstance', {
        EnablePerformanceInsights: false,
      });
    });

    it('creates the log groups before the instance that writes to them', () => {
      // RDS auto-creates these groups on first export and CloudFormation does
      // not own what RDS created, so without this ordering the LogGroup resource
      // races the instance and fails with AlreadyExists.
      const instances = data.findResources('AWS::RDS::DBInstance');
      const dependsOn = Object.values(instances)[0].DependsOn ?? [];
      const logGroupIds = Object.keys(data.findResources('AWS::Logs::LogGroup'));

      for (const id of logGroupIds) {
        expect(dependsOn).toContain(id);
      }
    });

    it('bounds log retention and tears the log groups down with the stack', () => {
      // Declared explicitly rather than via cloudwatchLogsRetention, which would
      // synthesise a LogRetention Lambda plus an IAM role that trips
      // AwsSolutions-IAM4/IAM5 and cannot be acknowledged in cdk-nag 3.0.2.
      data.resourceCountIs('AWS::Logs::LogGroup', 2);
      const groups = data.findResources('AWS::Logs::LogGroup');

      for (const group of Object.values(groups)) {
        expect(group.Properties.RetentionInDays).toBe(14);
        expect(group.DeletionPolicy).toBe('Delete');
      }
    });

    it('provisions no Lambda function', () => {
      // Nothing in this stack should need one. A Lambda appearing here means the
      // LogRetention custom resource came back.
      data.resourceCountIs('AWS::Lambda::Function', 0);
    });
  });

  describe('AWS naming and description constraints', () => {
    it('uses only ASCII in every description and name', () => {
      // RDS rejects a DBParameterGroup description containing non-ASCII with
      // InvalidRequest and fails the entire stack create. An em dash in a
      // comment-style description was enough to roll back the first deploy of
      // this stack, so the whole template is checked rather than one field.
      const walk = (node: unknown, path: string[] = []): string[] => {
        const problems: string[] = [];

        if (typeof node === 'string') {
          const key = path[path.length - 1] ?? '';
          if (/Description|Name$/i.test(key) && /[^\x20-\x7E]/.test(node)) {
            problems.push(`${path.join('.')} = ${JSON.stringify(node)}`);
          }
          return problems;
        }

        if (node && typeof node === 'object') {
          for (const [key, value] of Object.entries(node)) {
            problems.push(...walk(value, [...path, key]));
          }
        }

        return problems;
      };

      expect(walk(data.toJSON())).toEqual([]);
    });

    it('keeps the RDS instance identifier within the 63-character limit', () => {
      const instances = data.findResources('AWS::RDS::DBInstance');
      const identifier = Object.values(instances)[0].Properties.DBInstanceIdentifier;

      expect(identifier.length).toBeLessThanOrEqual(63);
      expect(identifier).toMatch(/^[a-z][a-z0-9-]*[a-z0-9]$/);
    });
  });

  describe('cross-stack contract', () => {
    it('publishes everything AppStack and the migration Lambda need', () => {
      const params = data.findResources('AWS::SSM::Parameter');
      const names = Object.values(params).map((p) => p.Properties.Name);

      expect(names).toEqual(
        expect.arrayContaining([
          TEST_NAMES.ssm.dbHost,
          TEST_NAMES.ssm.dbPort,
          TEST_NAMES.ssm.dbName,
          TEST_NAMES.ssm.dbSecretArn,
          TEST_NAMES.ssm.dbClientSecurityGroupId,
        ])
      );
    });
  });
});
