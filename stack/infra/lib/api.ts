import * as cdk from '@aws-cdk/core';
import * as ecs_patterns from '@aws-cdk/aws-ecs-patterns';
import * as ecs from '@aws-cdk/aws-ecs';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as lb from '@aws-cdk/aws-elasticloadbalancingv2';
import * as route53 from '@aws-cdk/aws-route53';
import * as iam from '@aws-cdk/aws-iam';
import * as events from '@aws-cdk/aws-events';
import * as logs from '@aws-cdk/aws-logs';

interface ApiProps {
  readonly bus: events.IEventBus;
  readonly domainName: string;
  readonly vpcId: string;
  readonly apiDir: string;
  readonly hostedZoneName?: string;
  readonly desiredCount?: number;
  readonly minCapacity?: number;
  readonly maxCapacity?: number;
  readonly assignPublicIp?: boolean;
}

export class Api extends cdk.Construct {
  public readonly api: ecs_patterns.ApplicationLoadBalancedFargateService;

  constructor(scope: cdk.Construct, id: string, props: ApiProps) {
    super(scope, id);

    cdk.requireProperty(props, 'bus', this);
    cdk.requireProperty(props, 'domainName', this);
    cdk.requireProperty(props, 'vpcId', this);
    cdk.requireProperty(props, 'apiDir', this);

    const logGroup = new logs.LogGroup(this, "ApiLog", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.TWO_MONTHS,
    });

    const api = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Api', {
      desiredCount: props.desiredCount,
      minHealthyPercent: 33,
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(props.apiDir),
        containerPort: 5000,
        environment: {
          EVENTBUS_NAME: props.bus.eventBusName,
        },
        logDriver: new ecs.AwsLogDriver({
          logGroup: logGroup,
          streamPrefix: 'Api',
        }),
      },
      assignPublicIp: props.assignPublicIp,
      protocol: lb.ApplicationProtocol.HTTPS,
      domainName: props.domainName,
      domainZone: route53.HostedZone.fromLookup(this, "Hz", {
        domainName: props.hostedZoneName
          ? props.hostedZoneName
          : props.domainName?.replace(/^\w+\./i, ''),
      }),
      redirectHTTP: true,
      vpc: ec2.Vpc.fromLookup(this, 'Vpc', {
        vpcId: props.vpcId,
      }),
    });

    api.targetGroup.configureHealthCheck({
      enabled: true,
      path: '/health',
    });

    api.taskDefinition.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["events:PutEvents",],
      resources: [props.bus.eventBusArn,],
    }));

    const scalableTarget = api.service.autoScaleTaskCount({
      minCapacity: props.minCapacity,
      maxCapacity: props.maxCapacity as number,
    });
    scalableTarget.scaleOnCpuUtilization('CPUScale', {
      targetUtilizationPercent: 80,
    });
    scalableTarget.scaleOnMemoryUtilization('MemoryScale', {
      targetUtilizationPercent: 80,
    });
    scalableTarget.scaleOnRequestCount('RequestScale', {
      targetGroup: api.targetGroup,
      requestsPerTarget: 1000,
    });

    this.api = api;
  }
}
