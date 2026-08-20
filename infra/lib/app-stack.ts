import * as cdk from 'aws-cdk-lib';
import { Validations } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Trigger } from 'aws-cdk-lib/triggers';
import { Construct } from 'constructs';
import * as path from 'path';
import {
  CONTAINER_PORT,
  DATABASE_NAME,
  DATABASE_USERNAME,
  ResourceNames,
  TIMEZONE,
} from './config';

export interface AppStackProps extends cdk.StackProps {
  readonly names: ResourceNames;
  readonly vpc: ec2.IVpc;
  readonly ecrRepository: ecr.IRepository;
  readonly dbInstance: rds.IDatabaseInstance;
  readonly dbSecret: secretsmanager.ISecret;
  /** Worn by the migration Lambda, which the database's group already accepts. */
  readonly dbClientSecurityGroup: ec2.ISecurityGroup;
  /** The database's own group, so the Fargate service can be allowed in. */
  readonly dbSecurityGroup: ec2.ISecurityGroup;
  /**
   * Git commit being deployed. Passed via `-c gitSha=<sha>`.
   *
   * Doubles as the ECR image tag and as the value that forces the deploy-time
   * migration to re-run.
   */
  readonly gitSha: string;
}

/**
 * ECS Fargate service behind an Application Load Balancer, plus the deploy-time
 * database migration.
 *
 * Ordering is enforced, not hoped for: the Trigger runs the migration Lambda and
 * the service declares a dependency on it, so no task can start against a
 * database without a schema.
 *
 * The tasks run in public subnets with `assignPublicIp` so they can pull from ECR
 * without a NAT gateway. They are not reachable from the internet: their security
 * group only accepts traffic from the load balancer's security group. "Public
 * subnet" describes a route table, not an access policy.
 */
export class AppStack extends cdk.Stack {
  public readonly migrationFunction: NodejsFunction;
  public readonly migrationTrigger: Trigger;
  public readonly service: ecs.FargateService;
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const {
      names,
      vpc,
      ecrRepository,
      dbInstance,
      dbSecret,
      dbClientSecurityGroup,
      dbSecurityGroup,
      gitSha,
    } = props;

    // =======================================================================
    // Deploy-time migration
    // =======================================================================

    const migrationLogGroup = new logs.LogGroup(this, 'MigrationLogGroup', {
      logGroupName: `/aws/lambda/${names.migrationFunction}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Role written out by hand rather than letting the Lambda construct attach
    // AWSLambdaBasicExecutionRole and AWSLambdaVPCAccessExecutionRole.
    //
    // It is least privilege — the managed policy grants log writes against every
    // log group in the account, where this needs exactly one. It also keeps
    // cdk-nag usable: AwsSolutions-IAM4 fires on any managed policy attachment
    // and cannot be acknowledged in cdk-nag 3.0.2 (see lib/nag.ts), so the only
    // way to keep the rule enforcing is to not attach one.
    const migrationRole = new iam.Role(this, 'MigrationRole', {
      roleName: names.migrationRole,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'PointHub deploy-time migration function',
    });

    migrationRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'WriteOwnLogs',
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [migrationLogGroup.logGroupArn, `${migrationLogGroup.logGroupArn}:*`],
      })
    );

    migrationRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'ManageVpcNetworkInterfaces',
        actions: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
          'ec2:AssignPrivateIpAddresses',
          'ec2:UnassignPrivateIpAddresses',
        ],
        // These five do not support resource-level permissions: Lambda creates
        // the ENI before an ARN exists to scope to. Same grant
        // AWSLambdaVPCAccessExecutionRole makes, written out so the wildcard is
        // visible in review instead of hidden behind a managed policy.
        resources: ['*'],
      })
    );

    this.migrationFunction = new NodejsFunction(this, 'MigrationFunction', {
      functionName: names.migrationFunction,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, '..', 'lambda', 'migrate-handler.ts'),
      handler: 'handler',
      architecture: lambda.Architecture.ARM_64,
      role: migrationRole,

      timeout: cdk.Duration.minutes(5),
      memorySize: 512,

      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      // Import the client SG by ID rather than using the L2 reference from
      // DataStack. Using the L2 directly causes CDK's connections system to
      // track a bidirectional relationship that introduces a cross-stack
      // dependency cycle (AppStack → DataStack via Trigger, and DataStack →
      // AppStack via the ALB SG that CDK auto-wires into connection peers).
      securityGroups: [
        ec2.SecurityGroup.fromSecurityGroupId(
          this,
          'MigrationDbClientSg',
          dbClientSecurityGroup.securityGroupId,
          { allowAllOutbound: true, mutable: false }
        ),
      ],

      environment: {
        DB_SECRET_ARN: dbSecret.secretArn,
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: dbInstance.dbInstanceEndpointPort,
        DB_NAME: DATABASE_NAME,
        // Not read by the handler. Present so the function's configuration
        // changes on every deployment, which is what makes the Trigger re-invoke
        // it rather than skip it as unchanged.
        GIT_SHA: gitSha,
      },

      logGroup: migrationLogGroup,

      bundling: {
        // esbuild compiles the handler together with pointhub/src/db, so the
        // schema and seed logic have exactly one definition shared by the CLI,
        // the test harness, the container and this function.
        minify: false,
        sourceMap: true,
        target: 'node20',
        format: OutputFormat.CJS,
        // The RDS trust store and the member CSV are inlined as strings: this
        // function has no NAT route and cannot fetch either at runtime.
        loader: {
          '.pem': 'text',
          '.csv': 'text',
        },
        // Provided by the Node 20 runtime.
        externalModules: ['@aws-sdk/client-secrets-manager'],
      },
    });

    dbSecret.grantRead(this.migrationFunction);

    this.migrationTrigger = new Trigger(this, 'MigrationTrigger', {
      handler: this.migrationFunction,
      executeAfter: [dbInstance],
      executeOnHandlerChange: true,
      timeout: cdk.Duration.minutes(6),
    });

    // =======================================================================
    // Fargate service
    // =======================================================================

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: names.ecsCluster,
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const taskLogGroup = new logs.LogGroup(this, 'TaskLogGroup', {
      logGroupName: names.taskLogGroup,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Execution role: what ECS itself uses to pull the image and ship logs,
    // before any application code runs. Inline for the same reasons as the
    // migration role — the managed AmazonECSTaskExecutionRolePolicy allows
    // pulling any repository in the account, where this needs one.
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: names.taskExecutionRole,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'PointHub ECS agent: image pull, log writes, secret fetch',
    });

    executionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'EcrAuth',
        actions: ['ecr:GetAuthorizationToken'],
        // Account-scoped by nature: the token is not tied to a repository, so
        // the API rejects a resource other than "*".
        resources: ['*'],
      })
    );

    executionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'PullPointhubImageOnly',
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: [ecrRepository.repositoryArn],
      })
    );

    executionRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        sid: 'WriteTaskLogs',
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [taskLogGroup.logGroupArn, `${taskLogGroup.logGroupArn}:*`],
      })
    );

    // Task role: the identity the application itself runs as. It needs nothing —
    // credentials arrive as an injected environment variable, and the service
    // calls no AWS API.
    const taskRole = new iam.Role(this, 'TaskRole', {
      roleName: names.taskRole,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'PointHub application task identity (no AWS API access)',
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      family: names.taskFamily,
      cpu: 256,
      memoryLimitMiB: 512,
      executionRole,
      taskRole,
      runtimePlatform: {
        // The image is built for ARM64 in CI; Graviton is also cheaper.
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    taskDefinition.addContainer('pointhub', {
      containerName: 'pointhub',
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository, gitSha),
      logging: ecs.LogDrivers.awsLogs({
        logGroup: taskLogGroup,
        streamPrefix: 'pointhub',
      }),

      environment: {
        PORT: String(CONTAINER_PORT),
        NODE_ENV: 'production',
        // Business timezone. Expiry month boundaries and day-of-week campaign
        // rules are read in Bangkok, and the image keeps tzdata installed so
        // this resolves.
        TZ: TIMEZONE,
        DB_HOST: dbInstance.dbInstanceEndpointAddress,
        DB_PORT: dbInstance.dbInstanceEndpointPort,
        DB_NAME: DATABASE_NAME,
        DB_USER: DATABASE_USERNAME,
        // Exactly the string 'true'. src/db/pool.ts tests `DB_SSL === 'true'`,
        // so any other truthy-looking value silently leaves TLS off — and the
        // instance runs with rds.force_ssl=1, so the connection would then be
        // refused outright.
        DB_SSL: 'true',
        // Shipped in the image by the Dockerfile certs stage. pool.ts throws at
        // startup if this file is missing rather than falling back to an
        // unverified connection.
        DB_CA_PATH: '/app/certs/rds-global-bundle.pem',
      },

      // The password is injected by the ECS agent from Secrets Manager, not
      // placed in `environment`. Values under `secrets` are resolved at task
      // start and do not appear in the task definition, which anyone with
      // ecs:DescribeTaskDefinition can read.
      secrets: {
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
      },

      portMappings: [{ containerPort: CONTAINER_PORT, protocol: ecs.Protocol.TCP }],

      // ECS ignores the image's own HEALTHCHECK, so it is restated here. Uses
      // node rather than curl because the runtime image has no HTTP client.
      healthCheck: {
        command: [
          'CMD-SHELL',
          `node -e "require('http').get({host:'127.0.0.1',port:${CONTAINER_PORT},path:'/api/health',timeout:4000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"`,
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(30),
      },

      // Nothing writes to disk: logs go to stdout and all state is in RDS.
      readonlyRootFilesystem: true,
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      securityGroupName: names.albSecurityGroup,
      // ASCII only. Non-ASCII here fails CloudFormation's GroupDescription
      // pattern, the same way an em dash failed the RDS parameter group.
      description: 'PointHub ALB - accepts HTTP from the internet',
      allowAllOutbound: true,
    });

    albSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      'HTTP from the internet'
    );

    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
      securityGroupName: names.serviceSecurityGroup,
      description: 'PointHub Fargate tasks - accepts traffic from the ALB only',
      allowAllOutbound: true,
    });

    serviceSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(CONTAINER_PORT),
      'From the load balancer only'
    );

    this.service = new ecs.FargateService(this, 'Service', {
      serviceName: names.ecsService,
      cluster,
      taskDefinition,
      desiredCount: 2,

      // Only this stack's own group. Attaching DataStack's client group here
      // instead would make CDK add the load balancer's ingress rules to it when
      // the service is registered as a target, which points DataStack back at
      // AppStack and fails synthesis with a dependency cycle. Database access is
      // granted by the explicit ingress rule below.
      securityGroups: [serviceSecurityGroup],

      // No NAT gateway: a public subnet plus a public IP is how the task reaches
      // ECR and CloudWatch. Inbound is still closed by the security group.
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },

      // Roll back automatically when a deployment cannot reach steady state,
      // rather than leaving the service stuck on a broken task definition.
      circuitBreaker: { enable: true, rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      enableExecuteCommand: false,
    });

    // Let the tasks reach PostgreSQL.
    //
    // Declared here, on the database's group, rather than by giving the service
    // the db-client group: this direction keeps the stack dependency one-way
    // (AppStack depends on DataStack, never the reverse). An L1 ingress resource
    // is used because `dbSecurityGroup` arrives as an ISecurityGroup from another
    // stack, so calling addIngressRule on it would attempt to mutate a construct
    // this stack does not own.
    new ec2.CfnSecurityGroupIngress(this, 'DbIngressFromService', {
      groupId: dbSecurityGroup.securityGroupId,
      sourceSecurityGroupId: serviceSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'PostgreSQL from the PointHub Fargate service',
    });

    // The service must not start before the schema exists.
    this.service.node.addDependency(this.migrationTrigger);

    const scaling = this.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 4,
    });

    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(3),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });

    // =======================================================================
    // Load balancer
    // =======================================================================

    this.alb = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      loadBalancerName: names.alb,
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const listener = this.alb.addListener('HttpListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
    });

    const targetGroup = listener.addTargets('EcsTarget', {
      port: CONTAINER_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        // /api/ready, not /api/health: readiness opens a database connection, so
        // a task that cannot reach RDS is taken out of service instead of being
        // sent traffic it will fail.
        path: '/api/ready',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },
      // Paired with the 10s graceful shutdown in src/index.ts, which drains the
      // HTTP server and the pg pool on SIGTERM.
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // =======================================================================
    // Alarms
    // =======================================================================

    new cloudwatch.Alarm(this, 'UnhealthyTargetsAlarm', {
      alarmName: `${names.alb}-unhealthy-targets`,
      alarmDescription: 'One or more PointHub tasks are failing the readiness check',
      // Unhealthy host count is a target-group metric, not a load-balancer one.
      metric: targetGroup.metrics.unhealthyHostCount({ period: cdk.Duration.minutes(1) }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cloudwatch.Alarm(this, 'ServerErrorAlarm', {
      alarmName: `${names.alb}-5xx`,
      alarmDescription: 'PointHub is returning server errors',
      metric: this.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
        period: cdk.Duration.minutes(5),
      }),
      threshold: 10,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // =======================================================================
    // Outputs
    // =======================================================================

    new ssm.StringParameter(this, 'AlbDnsParameter', {
      parameterName: names.ssm.albDns,
      stringValue: this.alb.loadBalancerDnsName,
      description: 'PointHub ALB DNS name; read by the post-deploy smoke test',
    });

    new cdk.CfnOutput(this, 'AlbDns', {
      value: this.alb.loadBalancerDnsName,
      description: 'Application URL',
    });

    new cdk.CfnOutput(this, 'MigrationFunctionName', {
      value: this.migrationFunction.functionName,
      description: `Deploy-time migration; logs in /aws/lambda/${names.migrationFunction}`,
    });

    new cdk.CfnOutput(this, 'ServiceName', { value: this.service.serviceName });

    this.acknowledgeAcceptedRisks(migrationRole, executionRole);
  }

  /**
   * cdk-nag findings accepted rather than fixed.
   *
   * Both wildcards below are on inline statements this stack writes, and both are
   * wildcards the AWS API requires. Every managed-policy attachment was removed
   * instead of being accepted, so IAM4 does not appear here — see lib/nag.ts for
   * the one CDK-internal exception that cannot be expressed at all.
   */
  private acknowledgeAcceptedRisks(migrationRole: iam.Role, executionRole: iam.Role): void {
    // Granular IAM5 findings. The id embeds the resource the wildcard appears on,
    // so it names the specific log-stream wildcard rather than blanket-accepting
    // every wildcard the role might grow later. It contains a single `::`, which
    // is the most aws-cdk-lib's qualifyId accepts.
    Validations.of(migrationRole).acknowledge({
      id: 'AwsSolutions-IAM5[Resource::<MigrationLogGroupFD140541.Arn>:*]',
      reason:
        'logs:PutLogEvents is granted on the log streams inside one named log group. ' +
        'Stream names are generated per invocation by Lambda, so the trailing wildcard ' +
        'is the narrowest grant the API allows. Nothing outside this function log group ' +
        'is reachable.',
    });

    Validations.of(executionRole).acknowledge({
      id: 'AwsSolutions-IAM5[Resource::<TaskLogGroup933EA2D6.Arn>:*]',
      reason:
        'Same shape as the migration role: log streams within one named group, created ' +
        'per task by the ECS agent. ecr:GetAuthorizationToken is separately scoped to "*" ' +
        'because the token it returns is not tied to a repository; the actions that read ' +
        'image layers are restricted to the PointHub repository ARN.',
    });

    Validations.of(this.migrationFunction).acknowledge({
      id: 'AwsSolutions::AwsSolutions-L1',
      reason:
        'Pinned to NODEJS_20_X rather than the newest runtime. Node 20 LTS is a platform ' +
        'mandate in technical-environment.md, and the function imports the application ' +
        'source directly, so it must run the same major version as the service. Revisit ' +
        'when the platform moves off Node 20.',
    });

    Validations.of(this.service.taskDefinition).acknowledge({
      id: 'AwsSolutions::AwsSolutions-ECS2',
      reason:
        'The environment block holds only non-secret configuration: port, node env, ' +
        'timezone, database host, port, name, user, and the TLS flag and CA path. The ' +
        'database password is the one sensitive value and it is injected through the ' +
        '`secrets` block from Secrets Manager, so it does not appear in the task ' +
        'definition. Moving the rest into Parameter Store would add a fetch on every task ' +
        'start for values that are already public.',
    });

    Validations.of(this.alb).acknowledge({
      id: 'AwsSolutions::AwsSolutions-EC23',
      reason:
        'The load balancer accepts 0.0.0.0/0 on port 80 because it is the public entry ' +
        'point for the customer-service UI and the POS-facing API. Restricting the source ' +
        'range would make the service unreachable. The tasks behind it accept traffic only ' +
        'from this security group, and the database accepts traffic only from the tasks.',
    });

    Validations.of(this.service.cluster).acknowledge({
      id: 'AwsSolutions::AwsSolutions-ECS4',
      reason:
        'Container Insights is disabled. It bills per ingested metric and log, and the ' +
        'task already emits structured pino logs to CloudWatch plus Prometheus metrics at ' +
        '/api/metrics. Worth enabling alongside a metrics backend, not before one exists.',
    });

    Validations.of(this.alb).acknowledge({
      id: 'AwsSolutions::AwsSolutions-ELB2',
      reason:
        'Access logs require an S3 bucket and a delivery policy, and would be the only S3 ' +
        'resource in this architecture. Request-level visibility already comes from ' +
        'pino-http, which records method, path, status and duration for every request.',
    });

    // dbSecret.grantRead() adds a wildcard KMS decrypt to both roles' DefaultPolicy
    // (the encryption key ARN is not known at synth time because RDS uses the
    // service-owned key). The finding is AwsSolutions-IAM5[Resource::*] on the
    // DefaultPolicy child, which is different from the log-stream wildcards above.
    const migrationDefaultPolicy = migrationRole.node.tryFindChild('DefaultPolicy');
    if (migrationDefaultPolicy) {
      Validations.of(migrationDefaultPolicy).acknowledge({
        id: 'AwsSolutions-IAM5[Resource::*]',
        reason:
          'Secrets Manager grantRead adds kms:Decrypt with Resource::* because the ' +
          'encryption key ARN is an unresolved token at synth time (RDS uses the default ' +
          'aws/secretsmanager service key). This is the standard CDK grant pattern.',
      });
    }

    const execDefaultPolicy = executionRole.node.tryFindChild('DefaultPolicy');
    if (execDefaultPolicy) {
      Validations.of(execDefaultPolicy).acknowledge({
        id: 'AwsSolutions-IAM5[Resource::*]',
        reason:
          'Same as the migration role: Secrets Manager grantRead adds kms:Decrypt with ' +
          'Resource::* for the service-owned encryption key. The actual secret actions ' +
          'are scoped to the single database credential ARN.',
      });
    }
  }
}
