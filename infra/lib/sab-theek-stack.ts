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
import * as logs from 'aws-cdk-lib/aws-logs';
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

export class SabTheekStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // One table. Raw signals carry a TTL because we keep the verdict, not the trail.
    const table = new dynamodb.Table(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      // Losing this table loses every learned routine and every pairing. A
      // stack replacement must not be able to take it with it.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
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
        // Logs default to never expiring. For a product that argues the signal
        // trail should expire, letting member ids accumulate in CloudWatch
        // forever would contradict the thing the product claims.
        logGroup: new logs.LogGroup(this, `${id}Logs`, {
          retention: logs.RetentionDays.ONE_MONTH,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      });
      table.grantReadWriteData(f);
      return f;
    };

    const enrollFn = makeFn('EnrollFn', 'enroll.handler');
    const ingestFn = makeFn('IngestFn', 'ingest.handler');
    const pulseFn = makeFn('PulseFn', 'pulse.handler');
    const resolveFn = makeFn('ResolveFn', 'resolve.handler');
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

    // A rung that throws must never leave the incident open. The sweep skips
    // any member with an open incident, so one failed execution would retire
    // that person from the system silently and permanently.
    const markFailed = new tasks.LambdaInvoke(this, 'MarkIncidentFailed', {
      lambdaFunction: escalateFn,
      payload: sfn.TaskInput.fromObject({
        action: 'failed',
        memberId: sfn.JsonPath.stringAt('$.memberId'),
        incidentId: sfn.JsonPath.stringAt('$.incidentId'),
      }),
      payloadResponseOnly: true,
      resultPath: sfn.JsonPath.DISCARD,
    }).next(
      new sfn.Fail(this, 'LadderFailed', {
        cause: 'A rung failed. The incident was closed so the next sweep can retry.',
      })
    );

    const guarded = <T extends tasks.LambdaInvoke>(task: T): T => {
      task.addCatch(markFailed, { resultPath: '$.error' });
      return task;
    };

    const rung = (id: string, action: string) =>
      guarded(
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
        })
      );

    const check = (id: string) =>
      guarded(
        new tasks.LambdaInvoke(this, id, {
          lambdaFunction: escalateFn,
          payload: sfn.TaskInput.fromObject({
            action: 'check',
            memberId: sfn.JsonPath.stringAt('$.memberId'),
            incidentId: sfn.JsonPath.stringAt('$.incidentId'),
          }),
          payloadResponseOnly: true,
          resultPath: '$.check',
        })
      );

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

    // Unlike the other rungs, this one's result is kept: the ladder needs to
    // know whether any phone actually buzzed.
    const tellFamily = guarded(
      new tasks.LambdaInvoke(this, 'TellTheFamily', {
        lambdaFunction: escalateFn,
        payload: sfn.TaskInput.fromObject({
          action: 'notifyChild',
          memberId: sfn.JsonPath.stringAt('$.memberId'),
          incidentId: sfn.JsonPath.stringAt('$.incidentId'),
          severity: sfn.JsonPath.stringAt('$.severity'),
        }),
        payloadResponseOnly: true,
        resultPath: '$.delivery',
      })
    );

    // Waiting twenty minutes after telling nobody is worse than not waiting at
    // all. If every token was stale or missing, hand straight to the neighbour.
    const afterTellingFamily = new sfn.Choice(this, 'DidAnyoneActuallyGetIt')
      .when(sfn.Condition.numberEquals('$.delivery.delivered', 0), notifyLocal)
      .otherwise(
        wait('WaitAfterFamily')
          .next(check('CheckAfterFamily'))
          .next(answered('AnsweredFamily', notifyLocal))
      );

    const politeLadder = rung('NudgeHer', 'nudge')
      .next(wait('WaitAfterNudge'))
      .next(check('CheckAfterNudge'))
      .next(
        answered(
          'AnsweredNudge',
          rung('RingThrough', 'ring')
            .next(wait('WaitAfterRing'))
            .next(check('CheckAfterRing'))
            .next(answered('AnsweredRing', tellFamily.next(afterTellingFamily)))
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
      { LADDER_ARN: ladder.stateMachineArn },
      60
    );
    ladder.grantStartExecution(sweepFn);
    // Needed to retire a running ladder when a later sweep decides things have
    // got worse, rather than running a second one alongside it.
    sweepFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['states:StopExecution'],
        resources: [`${ladder.stateMachineArn}:*`],
      })
    );

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
    route('/resolve', apigw.HttpMethod.POST, resolveFn, 'IntResolve');
    route('/demo/seed', apigw.HttpMethod.POST, demoFn, 'IntDemoSeed');
    route('/demo/anomaly', apigw.HttpMethod.POST, demoFn, 'IntDemoAnomaly');

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new cdk.CfnOutput(this, 'LadderArn', { value: ladder.stateMachineArn });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
  }
}
