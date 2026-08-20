import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { ResourceNames } from './config';

export interface EcrStackProps extends cdk.StackProps {
  readonly names: ResourceNames;
}

/**
 * Container registry.
 *
 * Deployed on its own, and first, because of an ordering constraint: the
 * application stack cannot be created until an image exists to reference, and
 * CI cannot push an image until a repository exists to push to. Keeping the
 * repository in a separate stack breaks that cycle — this stack is deployed once
 * from a workstation, then CI pushes, then the application stack deploys.
 */
export class EcrStack extends cdk.Stack {
  public readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    const { names } = props;

    this.repository = new ecr.Repository(this, 'Repository', {
      repositoryName: names.ecrRepository,

      // Immutable tags. Every image is tagged with its git commit SHA, so a tag
      // that could be overwritten would break the link between a running task
      // and the source it was built from — and make rollback unreliable, since
      // the previous tag might no longer hold the previous code.
      imageTagMutability: ecr.TagMutability.IMMUTABLE,

      // Amazon Inspector scans on push. This is a second opinion alongside the
      // Trivy gate in CI: Trivy blocks the image from ever being pushed, while
      // Inspector keeps re-evaluating images already in the registry as new
      // advisories are published.
      imageScanOnPush: true,

      encryption: ecr.RepositoryEncryption.AES_256,

      // Workshop account: the repository must be removable. emptyOnDelete is
      // required alongside DESTROY, otherwise the delete fails on a non-empty
      // repository and leaves the stack in DELETE_FAILED.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,

      lifecycleRules: [
        {
          description: 'Keep the 10 most recent images; expire older ones',
          maxImageCount: 10,
          rulePriority: 1,
          tagStatus: ecr.TagStatus.ANY,
        },
      ],
    });

    new ssm.StringParameter(this, 'RepositoryUriParameter', {
      parameterName: names.ssm.ecrRepositoryUri,
      stringValue: this.repository.repositoryUri,
      description: 'PointHub ECR repository URI',
      tier: ssm.ParameterTier.STANDARD,
    });

    new cdk.CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
      description: 'Push target for the CI image build',
    });

    new cdk.CfnOutput(this, 'RepositoryName', {
      value: this.repository.repositoryName,
    });
  }
}
