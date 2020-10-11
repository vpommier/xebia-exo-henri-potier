#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import * as path from 'path';
import { Stack } from '../lib/stack';

const tags = {
  Project: process.env.PROJECT_NAME as string,
  EnvironmentClass: process.env.ENVIRONMENT_CLASS as string,
  StackName: process.env.STACK_NAME as string,
};

const app = new cdk.App();
const stack = new Stack(app, 'Stack', {
  stackName: process.env.STACK_NAME,
  env: {
    account: process.env.STACK_ACCOUNT,
    region: process.env.STACK_REGION,
  },
  tags: tags,
  dispatcherDir: path.join(__dirname, "..", "..", "dispatcher"),
  apiDir: path.join(__dirname, "..", "..", "api"),
  stackEmailOwners: process.env.STACK_EMAIL_OWNERS?.split(','),
  eventsDetailType: process.env.EVENTS_DETAIL_TYPE?.split(','),
  eventsSources: process.env.EVENTS_SOURCES?.split(','),
  apiDesiredCount: process.env.API_DESIRED_COUNT
    ? parseInt(process.env.API_DESIRED_COUNT)
    : undefined,
  apiMinCapacity: process.env.API_MIN_CAPACITY
    ? parseInt(process.env.API_MIN_CAPACITY)
    : undefined,
  apiMaxCapacity: process.env.API_MAX_CAPACITY
    ? parseInt(process.env.API_MAX_CAPACITY)
    : undefined,
  reservedDispatcherSlots: process.env.RESERVED_DISPATCHER_SLOTS
    ? parseInt(process.env.RESERVED_DISPATCHER_SLOTS)
    : undefined,
  apiPubliclyAccessible: process.env.API_PUBLICLY_ACCESSIBLE
    ? JSON.parse(process.env.API_PUBLICLY_ACCESSIBLE) as boolean
    : undefined,
  apiDomainName: process.env.API_DOMAIN_NAME as string,
  vpcId: process.env.VPC_ID as string,
  hostedZoneName: process.env.HOSTED_ZONE_NAME,
});

for (const [key, value,] of Object.entries(tags)) {
  cdk.Tags.of(stack)
    .add(key, value);
}
