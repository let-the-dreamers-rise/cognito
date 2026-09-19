#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SabTheekStack } from '../lib/sab-theek-stack';

const app = new cdk.App();

new SabTheekStack(app, 'SabTheekStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
  description: 'Sab Theek - relief for the family of someone living alone',
});
