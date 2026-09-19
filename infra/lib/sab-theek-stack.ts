import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

/**
 * Nova Lite writes the daily sentence. Chosen over Anthropic-on-Bedrock because
 * it needs no use-case form on a fresh account, and because one short sentence
 * per person per day does not need a frontier model.
 *
 * Summaries fall back to a deterministic template whenever Bedrock is
 * unreachable or throttled, so a day always gets its sentence.
 */
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? 'us.amazon.nova-lite-v1:0';

/** Real escalations wait twenty minutes a rung. The demo passes its own value per execution. */
const STEP_WAIT_SECONDS = '1200';

export class SabTheekStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // One table. Raw signals carry a TTL because we keep the verdict, not the trail.
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
    });

    const code = lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda'));

    const makeFn = (
      id: string,
      handler: string,
      env: Record<string, string> = {},
      timeout = 10
    ) => {
      const f = new lambda.Function(this, id, {
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        code,
        handler,
        timeout: cdk.Duration.seconds(timeout),
        memorySize: 256,
        environment: { TABLE_NAME: table.tableName, ...env },
      });
      table.grantReadWriteData(f);
      return f;
    };

    const enrollFn = makeFn('EnrollFn', 'enroll.handler');
    const ingestFn = makeFn('IngestFn', 'ingest.handler');
    const pulseFn = makeFn('PulseFn', 'pulse.handler');
    const escalateFn = makeFn('EscalateFn', 'escalate.handler', {}, 20);
    const summarizeFn = makeFn(
      'SummarizeFn',
      'summarize.handler',
      { BEDROCK_MODEL_ID },
      60
    );

    // SNS carries the last rung to the neighbour, who will not have the app.
    escalateFn.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['sns:Publish'], resources: ['*'] })
    );

    summarizeFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['*'],
      })
    );

    // ---- The escalation ladder -------------------------------------------
    // She is asked first, twice, before anyone else is told anything at all.
    const rung = (id: string, action: string) =>
      new tasks.LambdaInvoke(this, id, {
        lambdaFunction: escalateFn,
        payload: sfn.TaskInput.fromObject({
          action,
          memberId: sfn.JsonPath.stringAt('$.memberId'),
          incidentId: sfn.JsonPath.stringAt('$.incidentId'),
          severity: sfn.JsonPath.stringAt('$.severity'),
        }),
        payloadResponseOnly: true,
        resultPath: sfn.JsonPath.DISCARD,
      });

    const check = (id: string) =>
      new tasks.LambdaInvoke(this, id, {
        lambdaFunction: escalateFn,
        payload: sfn.TaskInput.fromObject({
          action: 'check',
          memberId: sfn.JsonPath.stringAt('$.memberId'),
          incidentId: sfn.JsonPath.stringAt('$.incidentId'),
        }),
        payloadResponseOnly: true,
        resultPath: '$.check',
      });

    const wait = (id: string) =>
      new sfn.Wait(this, id, {
        time: sfn.WaitTime.secondsPath('$.waitSeconds'),
      });

    // She answered. Nobody is told there was ever a question.
    const standDown = new sfn.Succeed(this, 'SheIsFine', {
      comment: 'A sign of life closed the incident.',
    });

    const answered = (id: string, next: sfn.IChainable) =>
      new sfn.Choice(this, id)
        .when(sfn.Condition.booleanEquals('$.check.responded', true), standDown)
        .otherwise(next);

    const notifyLocal = rung('NotifyLocalContact', 'notifyLocal').next(
      rung('MarkEscalated', 'escalated')
    );

    // A day of silence is not a social situation. Above the threshold we skip
    // the polite rungs and go straight to whoever can physically reach her.
    const raiseAlarm = rung('AlarmTheFamily', 'notifyChild')
      .next(rung('AlarmTheNeighbour', 'notifyLocal'))
      .next(rung('MarkCriticalEscalated', 'escalated'));

    const politeLadder = rung('NudgeHer', 'nudge')
      .next(wait('WaitAfterNudge'))
      .next(check('CheckAfterNudge'))
      .next(
        answered(
          'AnsweredNudge',
          rung('RingThrough', 'ring')
            .next(wait('WaitAfterRing'))
            .next(check('CheckAfterRing'))
            .next(
              answered(
                'AnsweredRing',
                rung('TellTheFamily', 'notifyChild')
                  .next(wait('WaitAfterFamily'))
                  .next(check('CheckAfterFamily'))
                  .next(answered('AnsweredFamily', notifyLocal))
              )
            )
        )
      );

    const definition = new sfn.Choice(this, 'HowSeriousIsThis')
      .when(
        sfn.Condition.or(
          sfn.Condition.stringEquals('$.severity', 'critical48'),
          sfn.Condition.stringEquals('$.severity', 'critical24')
        ),
        raiseAlarm
      )
      .otherwise(politeLadder);

    const ladder = new sfn.StateMachine(this, 'EscalationLadder', {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.hours(6),
      tracingEnabled: true,
    });

    // ---- The clocks -------------------------------------------------------
    // Nothing here reacts to an event. The system turns on the absence of one.
    const sweepFn = makeFn(
      'SweepFn',
      'sweep.handler',
      { LADDER_ARN: ladder.stateMachineArn, STEP_WAIT_SECONDS },
      60
    );
    ladder.grantStartExecution(sweepFn);

    new events.Rule(this, 'AbsenceSweep', {
      description: 'Asks once per interval whether an ordinary day has happened yet',
      schedule: events.Schedule.rate(cdk.Duration.minutes(10)),
      targets: [new targets.LambdaFunction(sweepFn)],
    });

    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    summarizeFn.grantInvoke(schedulerRole);

    new scheduler.CfnSchedule(this, 'NightlySummary', {
      description: 'The one sentence, at the end of her day, in her timezone',
      flexibleTimeWindow: { mode: 'OFF' },
      scheduleExpression: 'cron(0 21 * * ? *)',
      scheduleExpressionTimezone: 'Asia/Kolkata',
      target: {
        arn: summarizeFn.functionArn,
        roleArn: schedulerRole.roleArn,
      },
    });

    // ---- The API ----------------------------------------------------------
    const demoFn = makeFn('DemoFn', 'demo.handler', {
      LADDER_ARN: ladder.stateMachineArn,
    });
    ladder.grantStartExecution(demoFn);

    const api = new apigw.HttpApi(this, 'Api', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowHeaders: ['content-type', 'authorization'],
      },
    });

    const route = (
      routePath: string,
      method: apigw.HttpMethod,
      handler: lambda.Function,
      id: string
    ) =>
      api.addRoutes({
        path: routePath,
        methods: [method],
        integration: new HttpLambdaIntegration(id, handler),
      });

    route('/enroll/parent', apigw.HttpMethod.POST, enrollFn, 'IntEnrolParent');
    route('/enroll/watcher', apigw.HttpMethod.POST, enrollFn, 'IntEnrolWatcher');
    route('/settings', apigw.HttpMethod.POST, enrollFn, 'IntSettings');
    route('/signals', apigw.HttpMethod.POST, ingestFn, 'IntSignals');
    route('/pulse', apigw.HttpMethod.GET, pulseFn, 'IntPulse');
    route('/demo/seed', apigw.HttpMethod.POST, demoFn, 'IntDemoSeed');
    route('/demo/anomaly', apigw.HttpMethod.POST, demoFn, 'IntDemoAnomaly');

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new cdk.CfnOutput(this, 'LadderArn', { value: ladder.stateMachineArn });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
  }
}
