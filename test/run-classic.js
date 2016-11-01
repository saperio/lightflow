import lightflowBrowser from '../dist/lightflow.js';
import lightflowBrowserMin from '../dist/lightflow.min.js';

import lightflowNodeLTS from '../lib/lts';
import lightflowNodeOld from '../lib/0.x';
import lightflowNode from '../lib';

import test from './test-classic';

export default function () {
	test('browser', lightflowBrowser);
	test('browser-min', lightflowBrowserMin);
	test('node-lts', lightflowNodeLTS);
	test('node-0.x', lightflowNodeOld);
	test('node', lightflowNode);
}