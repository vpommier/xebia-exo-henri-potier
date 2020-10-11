import * as cdk from '@aws-cdk/core';
import * as backend from './backend';
import * as api from './api';
import * as mon from './monitoring';

interface StackProps extends cdk.StackProps {
  readonly apiDir: string;
  readonly dispatcherDir: string;
  readonly apiDomainName: string;
  readonly vpcId: string;
  readonly stackEmailOwners?: string[];
  readonly hostedZoneName?: string;
  readonly eventsDetailType?: string[];
  readonly eventsSources?: string[];
  readonly apiDesiredCount?: number;
  readonly reservedDispatcherSlots?: number;
  readonly apiPubliclyAccessible?: boolean;
  readonly apiMinCapacity?: number;
  readonly apiMaxCapacity?: number;
}

export class Stack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: StackProps) {
    super(scope, id, props);

    cdk.requireProperty(props, 'apiDir', this);
    cdk.requireProperty(props, 'dispatcherDir', this);
    cdk.requireProperty(props, 'apiDomainName', this);
    cdk.requireProperty(props, 'vpcId', this);

    const back = new backend.Backend(this, "Backend", {
      dispatcherAlias: this.stackName,
      reservedDispatcherSlots: props.reservedDispatcherSlots,
      dispatcherDir: props.dispatcherDir as string,
      eventsDetailType: props.eventsDetailType,
      eventsSources: props.eventsSources,
    });
    const ap = new api.Api(this, "Api", {
      bus: back.bus,
      assignPublicIp: props.apiPubliclyAccessible,
      domainName: props.apiDomainName,
      vpcId: props.vpcId,
      hostedZoneName: props.hostedZoneName,
      apiDir: props.apiDir,
      desiredCount: props.apiDesiredCount,
      maxCapacity: props.apiMaxCapacity,
      minCapacity: props.apiMinCapacity,
    });
    new mon.Monitoring(this, 'Monitoring', {
      stackEmailOwners: props.stackEmailOwners,
      reservedDispatcherSlots: props.reservedDispatcherSlots,
      dashboardName: this.stackName,
      bus: back.bus,
      dispatcher: back.dispatcher,
      busToDispatcher: back.rule,
      objectStore: back.objectStore,
      queue: back.queue,
      dispatcherDlq: back.dispatcherDlq,
      dlq: back.dlq,
      api: ap.api,
    });
  }
}
