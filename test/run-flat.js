import lightflowBrowser from '../dist/flat/lightflow.js';
import lightflowBrowserMin from '../dist/flat/lightflow.min.js';

import lightflowNodeLTS from '../lib/lts/flat';
import lightflowNodeOld from '../lib/0.x/flat';
import lightflowNode from '../lib/flat';

import test from './test-flat';

export default function () {
	test('browser', lightflowBrowser);
	test('browser-min', lightflowBrowserMin);
	test('node-lts', lightflowNodeLTS);
	test('node-0.x', lightflowNodeOld);
	test('node', lightflowNode);
}