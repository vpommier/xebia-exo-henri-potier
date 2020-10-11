
import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as events from '@aws-cdk/aws-events';
import * as s3 from '@aws-cdk/aws-s3';
import * as sqs from '@aws-cdk/aws-sqs';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';
import * as lb from '@aws-cdk/aws-elasticloadbalancingv2';
import * as sns from '@aws-cdk/aws-sns';
import * as cw_actions from '@aws-cdk/aws-cloudwatch-actions';

interface MonitoringProps {
  readonly dashboardName: string;
  readonly reservedDispatcherSlots?: number;
  readonly stackEmailOwners?: string[];
  readonly dispatcher: lambda.IFunction;
  readonly busToDispatcher: events.IRule;
  readonly bus: events.IEventBus;
  readonly objectStore: s3.IBucket;
  readonly queue: sqs.IQueue;
  readonly dlq: sqs.IQueue;
  readonly dispatcherDlq: sqs.IQueue;
  readonly api: ecs_patterns.ApplicationLoadBalancedFargateService;
}

export class Monitoring extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: MonitoringProps) {
    super(scope, id);
    const dash = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: props.dashboardName,
    });

    const topic = new sns.Topic(this, 'AlarmTopic');
    props.stackEmailOwners?.forEach(e => {
      new sns.Subscription(this, 'StackOwners', {
        protocol: sns.SubscriptionProtocol.EMAIL,
        topic: topic,
        endpoint: e,
      });
    });
    const alarms = this.setApiAlarms(props.dashboardName, props.api).
      concat(this.setQueuesAlarms(props.dashboardName, props.queue, props.dlq, props.dispatcherDlq)).
      concat(this.setDispatcherAlarms(props.dashboardName, props.dispatcher, props.reservedDispatcherSlots));
    alarms.forEach(alarm => alarm.addAlarmAction(new cw_actions.SnsAction(topic)));

    this.setAlarmsDash(dash, alarms);
    this.setDispatcher(dash, props.dispatcher);
    this.setEventBus(dash, props.bus, props.busToDispatcher);
    this.setObjectStore(dash, props.objectStore);
    this.setQueue(dash, props.queue);
    this.setApiLb(dash, props.api);
    this.setApiService(dash, props.api);
  }

  private setQueuesAlarms(dashboardName: string, queue: sqs.IQueue, dlq: sqs.IQueue, dispatcherDlq: sqs.IQueue): cloudwatch.Alarm[] {
    return [
      new cloudwatch.Alarm(this, 'QueueMessagesSize', {
        metric: queue.metricSentMessageSize(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 254 * 1000 * 0.8, // 80% of AWS 254k limit
        evaluationPeriods: 1,
        actionsEnabled: true,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `ALERT ${dashboardName} One or more queue messages reach limit size in bytes.`,
      }),
      new cloudwatch.Alarm(this, 'QueueDelay', {
        metric: queue.metricApproximateAgeOfOldestMessage(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 7200,
        evaluationPeriods: 1,
        actionsEnabled: true,
        alarmDescription: `ALERT ${dashboardName} One or more tasks accumulate in the queue on backend.`,
      }),
      new cloudwatch.Alarm(this, 'DlqErrors', {
        metric: dlq.metricApproximateNumberOfMessagesVisible(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        threshold: 0,
        evaluationPeriods: 1,
        actionsEnabled: true,
        alarmDescription: `ALERT ${dashboardName} App behind queue not able to process queue messages.`,
      }),
      new cloudwatch.Alarm(this, 'DispatcherDlqErrors', {
        metric: dispatcherDlq.metricApproximateNumberOfMessagesVisible(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        threshold: 0,
        evaluationPeriods: 1,
        actionsEnabled: true,
        alarmDescription: `ALERT ${dashboardName} Dispatcher failed to process events.`,
      }),
    ];
  }

  private setApiAlarms(dashboardName: string, api: ecs_patterns.ApplicationLoadBalancedFargateService): cloudwatch.Alarm[] {
    return [
      new cloudwatch.Alarm(this, 'ApiCpu', {
        metric: api.service.metricCpuUtilization(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 80,
        evaluationPeriods: 1,
        actionsEnabled: true,
        alarmDescription: `WARN ${dashboardName} api cpu consumption.`,
      }),
      new cloudwatch.Alarm(this, 'ApiMemory', {
        metric: api.service.metricMemoryUtilization(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 80,
        evaluationPeriods: 1,
        actionsEnabled: true,
        alarmDescription: `WARN ${dashboardName} api memory consumption.`,
      }),
      new cloudwatch.Alarm(this, 'ApiAppErrors', {
        metric: api.targetGroup.metricHttpCodeTarget(lb.HttpCodeTarget.TARGET_5XX_COUNT, {
          period: cdk.Duration.minutes(2),
        }),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        threshold: 0,
        evaluationPeriods: 1,
        actionsEnabled: true,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `ALERT ${dashboardName} api answer with application error status.`,
      }),
      new cloudwatch.Alarm(this, 'ApiLatency', {
        metric: api.targetGroup.metricTargetResponseTime({
          period: cdk.Duration.minutes(2),
        }),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 0.5,
        evaluationPeriods: 1,
        actionsEnabled: true,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `ALERT ${dashboardName} api latency reach dangerous level.`,
      }),
    ];
  }

  private setDispatcherAlarms(dashboardName: string, dispatcher: lambda.IFunction, reservedDispatcherSlots?: number): cloudwatch.Alarm[] {
    let alarms = [
      new cloudwatch.Alarm(this, 'DispatcherErrors', {
        metric: dispatcher.metricErrors(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        threshold: 0,
        evaluationPeriods: 1,
        actionsEnabled: true,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `WARN ${dashboardName} dispatcher execution in errors.`,
      }),
      new cloudwatch.Alarm(this, 'DispatcherThrottling', {
        metric: dispatcher.metricThrottles(),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        threshold: 0,
        evaluationPeriods: 1,
        actionsEnabled: true,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `WARN ${dashboardName} dispatcher throttling.`,
      }),
      new cloudwatch.Alarm(this, 'DispatcherDuration', {
        metric: dispatcher.metricDuration({
          unit: cloudwatch.Unit.SECONDS,
        }),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: 60 * 0.6, // 60% of the dispatcher timeout.
        evaluationPeriods: 1,
        actionsEnabled: true,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `WARN ${dashboardName} dispatcher abnormally slow.`,
      }),
    ];
    if (reservedDispatcherSlots) {
      alarms.push(new cloudwatch.Alarm(this, 'DispatcherConcurrentExecutions', {
        metric: dispatcher.metric('ConcurrentExecutions', {
          statistic: cloudwatch.Statistic.SUM,
          unit: cloudwatch.Unit.COUNT,
        }),
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        threshold: Math.round(reservedDispatcherSlots * 0.8),
        evaluationPeriods: 1,
        actionsEnabled: true,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: `WARN ${dashboardName} dispatcher concurent executions reach dangerous levels.`,
      }));
    }
    return alarms;
  }

  private setApiService(dash: cloudwatch.Dashboard, api: ecs_patterns.ApplicationLoadBalancedFargateService) {
    dash.addWidgets(new cloudwatch.GraphWidget({
      title: 'Api service',
      width: cloudwatch.GRID_WIDTH,
      height: 6,
      left: [
        api.service.metricCpuUtilization(),
        api.service.metricMemoryUtilization(),
      ],
    }));
  }

  private setQueue(dash: cloudwatch.Dashboard, queue: sqs.IQueue) {
    dash.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Queue messages size',
        width: 12,
        height: 6,
        left: [
          queue.metricSentMessageSize(),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Queue messages',
        width: 12,
        height: 6,
        left: [
          queue.metricApproximateNumberOfMessagesNotVisible({
            label: 'InProcess',
          }),
          queue.metricApproximateNumberOfMessagesVisible({
            label: 'ToBeProcessed',
          }),
        ],
      })
    );
  }

  private setObjectStore(dash: cloudwatch.Dashboard, bucket: s3.IBucket) {
    dash.addWidgets(new cloudwatch.GraphWidget({
      title: 'Object store',
      width: cloudwatch.GRID_WIDTH,
      height: 6,
      left: [
        new cloudwatch.Metric({
          metricName: 'BucketSizeBytes',
          namespace: 'AWS/S3',
          dimensions: {
            'StorageType': 'StandardStorage',
            'BucketName': bucket.bucketName,
          },
          statistic: cloudwatch.Statistic.AVERAGE,
          unit: cloudwatch.Unit.BYTES,
          period: cdk.Duration.days(1),
        }),
      ],
    }));
  }

  private setDispatcher(dash: cloudwatch.Dashboard, dispatcher: lambda.IFunction) {
    dash.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Dispatcher concurrency',
        width: 12,
        height: 6,
        left: [
          dispatcher.metric('ConcurrentExecutions', {
            statistic: cloudwatch.Statistic.SUM,
            unit: cloudwatch.Unit.COUNT,
          }),
          dispatcher.metricThrottles(),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'Dispatcher execution',
        width: 12,
        height: 6,
        left: [
          dispatcher.metricInvocations(),
          dispatcher.metricErrors(),
        ],
      })
    );
    dash.addWidgets(new cloudwatch.GraphWidget({
      title: 'Dispatcher duration',
      width: cloudwatch.GRID_WIDTH,
      height: 6,
      left: [
        dispatcher.metricDuration(),
      ],
    }));
  }

  private setEventBus(dash: cloudwatch.Dashboard, bus: events.IEventBus, rule: events.IRule) {
    dash.addWidgets(new cloudwatch.GraphWidget({
      title: 'Event bus',
      width: cloudwatch.GRID_WIDTH,
      height: 6,
      left: [
        new cloudwatch.Metric({
          metricName: 'Invocations',
          namespace: 'AWS/Events',
          dimensions: {
            'EventBusName': bus.eventBusName,
            'RuleName': rule.ruleName,
          },
          unit: cloudwatch.Unit.COUNT,
          statistic: cloudwatch.Statistic.SUM,
        }),
      ],
    }));
  }

  private setApiLb(dash: cloudwatch.Dashboard, api: ecs_patterns.ApplicationLoadBalancedFargateService) {
    dash.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API requests status.',
        width: 12,
        height: 6,
        left: [
          api.targetGroup.metricHttpCodeTarget(lb.HttpCodeTarget.TARGET_2XX_COUNT, {
            label: '2XX',
          }),
          api.targetGroup.metricHttpCodeTarget(lb.HttpCodeTarget.TARGET_3XX_COUNT, {
            label: '3XX',
          }),
          api.targetGroup.metricHttpCodeTarget(lb.HttpCodeTarget.TARGET_4XX_COUNT, {
            label: '4XX',
          }),
          api.targetGroup.metricHttpCodeTarget(lb.HttpCodeTarget.TARGET_5XX_COUNT, {
            label: '5XX',
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: 'API unhealthy hosts.',
        width: 12,
        height: 6,
        left: [
          api.targetGroup.metricUnhealthyHostCount(),
        ],
      })
    );
  }

  private setAlarmsDash(dash: cloudwatch.Dashboard, alarms: cloudwatch.IAlarm[]) {
    dash.addWidgets(new cloudwatch.AlarmStatusWidget({
      title: 'Alarms to watch',
      width: cloudwatch.GRID_WIDTH,
      height: 6,
      alarms: alarms,
    }));
  }
}
