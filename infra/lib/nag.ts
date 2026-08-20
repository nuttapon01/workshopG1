import { CfnResource } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

/**
 * AwsSolutionsChecks with a narrow, path-scoped exemption list.
 *
 * Why this exists rather than an acknowledgement
 * ---------------------------------------------
 * cdk-nag reports an AWS managed policy attachment as a granular finding whose id
 * embeds the policy ARN:
 *
 *   AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/...]
 *
 * `Validations.of(x).acknowledge({ id })` in aws-cdk-lib 2.266.0 passes that id
 * through `qualifyId`, which splits on `::` and throws InvalidValidationId when
 * the result has more than two parts. The policy ARN contains three, so the
 * finding cannot be expressed — and acknowledging the bare rule id does not match
 * a granular finding. Both were verified against this codebase.
 *
 * So there is no supported way to accept an IAM4 finding in this version. Rather
 * than give up and let `cdk synth` fail permanently — which would turn cdk-nag
 * from a gate into noise everyone learns to ignore — the specific constructs that
 * cannot be fixed are exempted here, by path, with a reason.
 *
 * Scope of the exemption is deliberately tiny:
 *   - Every IAM role this project defines uses inline least-privilege statements
 *     and no managed policies, so nothing of ours needs to be listed.
 *   - What remains is IAM that CDK generates inside constructs and does not
 *     expose: the custom-resource provider behind `aws-cdk-lib/triggers`.
 *   - Exempt resources are skipped entirely, so add nothing here that carries
 *     application logic.
 *
 * Every other rule, on every other resource, still fails the build.
 */
export class PointhubNagPack extends AwsSolutionsChecks {
  private static readonly EXEMPT: ReadonlyArray<{
    readonly pattern: RegExp;
    readonly reason: string;
  }> = [
    {
      // The provider Lambda that aws-cdk-lib/triggers creates to invoke the
      // trigger target during deployment. Its role, and the
      // AWSLambdaBasicExecutionRole attachment on it, are internal to the
      // construct and unreachable from the public API.
      pattern: /AWSCDKTriggerCustomResourceProvider/,
      reason: 'CDK-internal custom resource provider for aws-cdk-lib/triggers',
    },
  ];

  /** Paths skipped during the last validation, for reporting. */
  public readonly skipped: string[] = [];

  protected checkResource(node: CfnResource): void {
    const exemption = PointhubNagPack.EXEMPT.find((entry) => entry.pattern.test(node.node.path));

    if (exemption) {
      this.skipped.push(`${node.node.path} (${exemption.reason})`);
      return;
    }

    super.checkResource(node);
  }
}
