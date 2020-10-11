import * as assertCdk from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as fullStack from '../lib/stack';

test('Empty Stack', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new fullStack.Stack(app, 'MyTestStack');
  // THEN
  assertCdk.expect(stack).to(assertCdk.matchTemplate({
    "Resources": {}
  }, assertCdk.MatchStyle.EXACT))
});
