import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda';
import * as events_targets from '@aws-cdk/aws-events-targets';
import * as events from '@aws-cdk/aws-events';
import * as s3 from '@aws-cdk/aws-s3';
import * as kms from '@aws-cdk/aws-kms';
import * as iam from '@aws-cdk/aws-iam';
import * as sqs from '@aws-cdk/aws-sqs';
import * as logs from '@aws-cdk/aws-logs';

interface BackendProps {
  readonly dispatcherDir: string;
  readonly dispatcherAlias: string;
  readonly reservedDispatcherSlots?: number;
  readonly eventsDetailType?: string[];
  readonly eventsSources?: string[];
}

export class Backend extends cdk.Construct {
  public readonly bus: events.IEventBus;
  public readonly rule: events.IRule;
  public readonly dispatcher: lambda.IFunction;
  public readonly objectStore: s3.IBucket;
  public readonly queue: sqs.IQueue;
  public readonly dlq: sqs.IQueue;
  public readonly dispatcherDlq: sqs.IQueue;

  constructor(scope: cdk.Construct, id: string, props: BackendProps) {
    super(scope, id);

    cdk.requireProperty(props, 'dispatcherDir', this);
    cdk.requireProperty(props, 'dispatcherAlias', this);

    const key = new kms.Key(this, "Key", {
      description: "Secure backend data.",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const bucket = new s3.Bucket(this, "ObjectStore", {
      versioned: true,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: key,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const dispatcherDlq = new sqs.Queue(this, 'DispatcherDlq', {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: key,
    });
    const dlq = new sqs.Queue(this, 'Dlq', {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: key,
    });
    const queue = new sqs.Queue(this, 'Queue', {
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: key,
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: dlq,
      },
    });

    const dispatcherTimeout = cdk.Duration.minutes(1);
    const dispatcher = new lambda.Function(this, "Dispatcher", {
      code: lambda.Code.fromAsset(props.dispatcherDir),
      handler: 'app.lambdaHandler',
      runtime: lambda.Runtime.NODEJS_12_X,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        QUEUE_URL: queue.queueUrl,
      },
      deadLetterQueue: dispatcherDlq,
      reservedConcurrentExecutions: props.reservedDispatcherSlots,
      timeout: dispatcherTimeout,
      logRetention: logs.RetentionDays.TWO_MONTHS,
    });

    bucket.grantPut(dispatcher.role as iam.IRole);
    queue.grantSendMessages(dispatcher.role as iam.IRole);

    const bus = new events.EventBus(this, "Bus");
    const rule = new events.Rule(this, "HandleEvents", {
      eventBus: bus,
      eventPattern: {
        detailType: props.eventsDetailType || [],
        source: props.eventsSources || [],
      },
    });
    rule.addTarget(new events_targets.LambdaFunction(dispatcher));

    this.dispatcher = dispatcher;
    this.bus = bus;
    this.rule = rule;
    this.objectStore = bucket;
    this.queue = queue;
    this.dlq = dlq;
    this.dispatcherDlq = dispatcherDlq;
  }
}
