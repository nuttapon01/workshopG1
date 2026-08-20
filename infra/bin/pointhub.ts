#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { Tags, Validations } from 'aws-cdk-lib';
import { PointhubNagPack } from '../lib/nag';
import { EcrStack } from '../lib/ecr-stack';
import { NetworkStack } from '../lib/network-stack';
import { DataStack } from '../lib/data-stack';
import { AppStack } from '../lib/app-stack';
import { commonTags, REGION, resourceNames } from '../lib/config';
import { loadDotEnv, REPO_ENV_PATH, resolveDeployer } from '../lib/deployer';

// DEPLOYER comes from the repository-root .env unless it is already exported.
// The AWS account is shared between workshop groups, so it prefixes every stack
// and every account-unique resource name. resolveDeployer throws when it is
// missing rather than defaulting — a silent default is how two groups end up
// sharing one database.
loadDotEnv(REPO_ENV_PATH);
const deployer = resolveDeployer();
const names = resourceNames(deployer);

const app = new cdk.App();

/**
 * Account comes from the ambient credentials; region is pinned in config.ts so
 * that a stray AWS_REGION in someone's shell cannot deploy half the
 * architecture into the wrong place.
 */
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: REGION,
};

const ecrStack = new EcrStack(app, names.stack('ecr'), {
  env,
  names,
  description: `PointHub container registry (${deployer.raw})`,
});

const networkStack = new NetworkStack(app, names.stack('network'), {
  env,
  names,
  description: `PointHub VPC, subnets and interface endpoints (${deployer.raw})`,
});

const dataStack = new DataStack(app, names.stack('data'), {
  env,
  names,
  description: `PointHub RDS PostgreSQL 15 (${deployer.raw})`,
  vpc: networkStack.vpc,
});

/**
 * Commit being deployed, used to tag the image and to force the deploy-time
 * migration to re-run. CI passes `-c gitSha=<sha>`; a local deploy falls back to
 * a marker so it is obvious in logs that the value did not come from CI.
 */
const gitSha = (app.node.tryGetContext('gitSha') as string | undefined) ?? 'local';

const appStack = new AppStack(app, names.stack('app'), {
  env,
  names,
  description: `PointHub application and deploy-time migration (${deployer.raw})`,
  vpc: networkStack.vpc,
  ecrRepository: ecrStack.repository,
  dbInstance: dataStack.instance,
  dbSecret: dataStack.secret,
  dbClientSecurityGroup: dataStack.clientSecurityGroup,
  dbSecurityGroup: dataStack.databaseSecurityGroup,
  gitSha,
});

for (const stack of [ecrStack, networkStack, dataStack, appStack]) {
  for (const [key, value] of Object.entries(commonTags(deployer))) {
    Tags.of(stack).add(key, value);
  }
}

// cdk-nag runs on every synth, so a finding fails `npm run synth` and therefore
// the deploy — rather than being something a person has to remember to check.
//
// cdk-nag 3.x registers as a policy validation plugin. The 2.x idiom
// (`Aspects.of(app).add(new AwsSolutionsChecks())`) no longer type-checks: the
// pack implements IPolicyValidationPlugin, not IAspect.
//
// PointhubNagPack is AwsSolutionsChecks plus one documented path exemption for
// IAM that CDK generates inside aws-cdk-lib/triggers and does not expose. See
// lib/nag.ts for why that cannot be handled with an acknowledgement.
Validations.of(app).addPlugins(new PointhubNagPack(app, { verbose: true }));

app.synth();
