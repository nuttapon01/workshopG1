import { Deployer } from './deployer';

/**
 * Shared configuration for the PointHub stacks.
 *
 * Constants that are the same for everyone live at the top. Anything that has to
 * be unique within the AWS account is derived from the deployer identity by
 * `resourceNames()` at the bottom — see lib/deployer.ts for why.
 */

/** Deployment environment. Only one exists — see R9 in the implementation plan. */
export const ENV_NAME = 'prod';

/**
 * Region.
 *
 * ap-southeast-7 (Thailand) rather than ap-southeast-1 (Singapore): it is the
 * region the account is configured for, it is closest to the business, and it
 * carries everything these stacks need. Verified against the live API before
 * committing to it — 3 availability zones, PostgreSQL 15.18, db.t4g.micro
 * orderable on gp3, and interface endpoints for secretsmanager and logs.
 */
export const REGION = 'ap-southeast-7';

/**
 * Business timezone, per the platform mandate in technical-environment.md.
 * Expiry month boundaries and day-of-week campaign rules are read in Bangkok.
 */
export const TIMEZONE = 'Asia/Bangkok';

/** Database name inside the RDS instance. Scoped by the instance, so not prefixed. */
export const DATABASE_NAME = 'pointhub';

/** Master username. Scoped by the instance, so not prefixed. */
export const DATABASE_USERNAME = 'pointhub';

/** PostgreSQL major.minor. 15 is a platform mandate; .18 is the latest 15.x in region. */
export const POSTGRES_VERSION = '15.18';

/** Port the container listens on. */
export const CONTAINER_PORT = 3000;

/**
 * VPC address range.
 *
 * Declared as a literal rather than read back from `vpc.vpcCidrBlock` at
 * synth time. Security group rules built from the attribute reference are
 * CloudFormation tokens, and cdk-nag cannot evaluate a token to confirm the rule
 * is not opening 0.0.0.0/0 — it reports AwsSolutions-EC23 as an unvalidatable
 * rule. Using the literal keeps that check meaningful.
 *
 * Each deployer gets their own VPC, so the range does not need to be unique.
 */
export const VPC_CIDR = '10.42.0.0/16';

/**
 * GitHub repository allowed to assume the deployment role, as
 * `<owner>/<repo>`. Used to build the OIDC trust policy subject.
 */
export const GITHUB_REPOSITORY = 'nuttapon01/workshopG1';

/** Only this branch may assume the deployment role. */
export const DEPLOY_BRANCH = 'production';

/** Logical stack suffixes, appended to the deployer stack prefix. */
export const STACK_SUFFIX = {
  ecr: 'PointhubEcr',
  network: 'PointhubNetwork',
  data: 'PointhubData',
  app: 'PointhubApp',
  cicdRole: 'PointhubCicdRole',
} as const;

export type StackKey = keyof typeof STACK_SUFFIX;

/**
 * Every name that has to be unique inside the AWS account or region.
 *
 * Grouped in one function so that adding a resource means adding its name here,
 * where the prefixing is impossible to forget, rather than inlining a literal in
 * a stack and discovering the collision when a second group deploys.
 */
export function resourceNames(deployer: Deployer) {
  const { slug, stackPrefix } = deployer;

  /** SSM parameter namespace, e.g. /siam-megamart-point-hub/prod */
  const ssmRoot = `/${slug}/${ENV_NAME}`;

  return {
    /** CloudFormation stack name for a logical stack. */
    stack: (key: StackKey) => `${stackPrefix}-${STACK_SUFFIX[key]}`,

    /** ECR repository. Lowercase only, so derived from the slug. */
    ecrRepository: `${slug}/pointhub`,

    vpc: `${slug}-pointhub-vpc`,
    vpcFlowLogGroup: `/aws/vpc/${slug}-pointhub-flow-logs`,

    /** RDS instance identifier. Lowercase, must start with a letter, max 63 chars. */
    dbInstance: `${slug}-pointhub-prod`,
    dbSecurityGroup: `${slug}-pointhub-db`,
    dbClientSecurityGroup: `${slug}-pointhub-db-client`,
    dbSecret: `${slug}/${ENV_NAME}/pointhub-db`,

    cicdRole: `${stackPrefix}-pointhub-github-deploy`,

    migrationFunction: `${slug}-pointhub-migrate`,
    migrationRole: `${stackPrefix}-pointhub-migrate`,

    ecsCluster: `${slug}-pointhub-cluster`,
    ecsService: `${slug}-pointhub-service`,
    taskFamily: `${slug}-pointhub`,
    taskLogGroup: `/ecs/${slug}-pointhub`,
    taskExecutionRole: `${stackPrefix}-pointhub-task-execution`,
    taskRole: `${stackPrefix}-pointhub-task`,
    albSecurityGroup: `${slug}-pointhub-alb`,
    serviceSecurityGroup: `${slug}-pointhub-service`,

    /**
     * Load balancer name. Capped at 32 characters by ELB, which is tighter than
     * anything else here, so it is truncated rather than allowed to fail at
     * deploy time.
     */
    alb: `${slug}-pointhub`.slice(0, 32).replace(/-+$/, ''),

    ssm: {
      vpcId: `${ssmRoot}/vpc-id`,
      ecrRepositoryUri: `${ssmRoot}/ecr-repo-uri`,
      dbHost: `${ssmRoot}/db/host`,
      dbPort: `${ssmRoot}/db/port`,
      dbName: `${ssmRoot}/db/name`,
      dbSecretArn: `${ssmRoot}/db/secret-arn`,
      dbClientSecurityGroupId: `${ssmRoot}/db/client-sg-id`,
      albDns: `${ssmRoot}/alb-dns`,
      cicdRoleArn: `${ssmRoot}/cicd-role-arn`,
    },
  };
}

export type ResourceNames = ReturnType<typeof resourceNames>;

/**
 * Tags applied to every resource.
 *
 * `Deployer` is the one that matters operationally: it is how you work out whose
 * resources you are looking at, and how to filter a shared account's bill.
 */
export function commonTags(deployer: Deployer): Record<string, string> {
  return {
    Project: 'pointhub',
    Environment: ENV_NAME,
    ManagedBy: 'cdk',
    Repository: GITHUB_REPOSITORY,
    Deployer: deployer.raw,
  };
}
