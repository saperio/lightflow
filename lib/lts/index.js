'use strict';

Object.defineProperty(exports, "__esModule", {
	value: true
});

exports['default'] = function (params) {
	return new Lightflow(params || {});
};

// extend target with src or clone src if no target
const extend = function extend(target, src) {
	if (src === null || typeof src !== 'object') {
		return src;
	}

	const needInit = typeof target !== typeof src || target instanceof Array !== src instanceof Array;

	if (src instanceof Array) {
		target = needInit ? [] : target;
		for (let i = 0; i < src.length; ++i) {
			target[i] = extend(target[i], src[i]);
		}
		return target;
	}

	if (typeof src === 'object') {
		target = needInit ? {} : target;
		for (let attr in src) {
			if (src.hasOwnProperty(attr)) {
				target[attr] = extend(target[attr], src[attr]);
			}
		}
		return target;
	}

	return src;
};

const process = function process(flow, data, label) {
	// check flow is done and call stopTask if needed
	if (!flow.active) {
		if (flow.stopTask) {
			var _flow$stopTask = flow.stopTask;
			let task = _flow$stopTask.task;
			let context = _flow$stopTask.context;

			task.call(context, data);
			flow.stopTask = undefined;
		}
		return;
	}

	const datafencing = flow.flags.datafencing;

	// check if all tasks of current step is done
	// and merge data from all parallel tasks in curStep.storage

	let nextData = data;
	if (flow.idx >= 0) {
		const curStep = flow.stepChain[flow.idx];
		if (++curStep.currentCount < curStep.maxCount) {
			if (datafencing) {
				curStep.storage = extend(curStep.storage, data);
			}
			return;
		}

		if (curStep.storage) {
			nextData = extend(curStep.storage, data);
			curStep.storage = null;
		}
	}

	// check if we need skip to specific step
	if (typeof label === 'string') {
		for (let i = flow.idx + 1; i < flow.stepChain.length; ++i) {
			if (flow.stepChain[i].taskList[0].label === label) {
				flow.idx = i;
				break;
			}
		}
	}

	// process next step
	if (++flow.idx < flow.stepChain.length) {
		const nextStep = flow.stepChain[flow.idx];

		++flow.stepId;

		nextStep.stepId = flow.stepId;
		nextStep.currentCount = 0;
		nextStep.taskList.forEach(taskDesc => {
			taskDesc.currentCount = 0;
			taskDesc.maxCount = 1;
			taskDesc.processTaskFn(flow, taskDesc, datafencing ? extend(undefined, nextData) : nextData);
		});
	} else {
		flow.stop();
		flow.doneChain.forEach(item => item.task.call(item.context, nextData));

		if (flow.looped) {
			flow.start(nextData);
		}
	}
};

const processTaskLabel = function processTaskLabel(flow, taskDesc, data) {
	process(flow, data);
};

const processTaskFunction = function processTaskFunction(flow, taskDesc, data) {
	const task = taskDesc.task;
	const context = taskDesc.context;
	const stepId = flow.stepId;

	const next = (nextData, label) => {
		// first check if flow still on this stepId
		// and then - if this task is done
		if (stepId === flow.stepId && ++taskDesc.currentCount >= taskDesc.maxCount) {
			process(flow, nextData, label);
		}
	};
	const error = err => {
		// check if flow still on this stepId
		if (stepId === flow.stepId) {
			processError(flow, err);
		}
	};
	const count = maxCount => taskDesc.maxCount = isNaN(parseInt(maxCount)) || maxCount < 1 ? 1 : maxCount;

	task.call(context, { next, error, count, data });
};

const processTaskFlow = function processTaskFlow(flow, taskDesc, data) {
	const task = taskDesc.task;


	task.loop(false).start(data);
};

const processError = function processError(flow, err) {
	const continueData = flow.errorChain.filter(item => item.idx === flow.idx).reduce((prev, item) => {
		const data = item.task.call(item.context, err);
		if (data !== undefined) {
			return data;
		}

		return prev;
	}, undefined);

	if (continueData !== undefined) {
		// update currentCount in current step
		// to proceed to the next step
		flow.stepChain[flow.idx].currentCount = flow.stepChain[flow.idx].maxCount;
		process(flow, continueData);
	} else {
		flow.stop();
		flow.catchChain.filter(item => item.idx >= flow.idx).forEach(item => item.task.call(item.context, err));
	}
};

const createTaskList = function createTaskList(flow, params) {
	const taskList = [];

	if (!params) {
		return taskList;
	}

	if (typeof params[0] === 'string') {
		taskList.push({
			label: params[0],
			processTaskFn: processTaskLabel
		});
	} else {
		params.forEach(param => {
			if (typeof param === 'function') {
				taskList.push({
					task: param,
					processTaskFn: processTaskFunction
				});
			} else if (param instanceof Lightflow) {
				let stepIdx = flow.stepChain.length;

				param.done(nextData => {
					if (flow.stepChain[stepIdx].stepId === flow.stepId) {
						process(flow, nextData);
					}
				})['catch'](err => {
					if (flow.stepChain[stepIdx].stepId === flow.stepId) {
						processError(flow, err);
					}
				});

				taskList.push({
					task: param,
					processTaskFn: processTaskFlow
				});
			} else if (taskList.length) {
				taskList[taskList.length - 1].context = param;
			}
		});
	}

	return taskList;
};

class Lightflow {
	constructor(_ref) {
		let datafencing = _ref.datafencing;

		this.flags = {
			datafencing: datafencing === undefined || !!datafencing
		};
		this.stepId = 0;
		this.idx = -1;
		this.active = false;
		this.looped = false;

		/*
  type Task = {
  	currentCount?: number = 0;
  	maxCount?: number = 1;
  	task?: TaskFn | Lightflow;
  	context?: any;
  	label?: string;
  	processTaskFn: Function;
  }
  type Step = {
  	taskList: Task[];
  	stepId: number;
  	currentCount?: number;
  	maxCount: number;
  	storage: any;
  }
  stepChain: Step[];
  */
		this.stepChain = [];

		this.doneChain = [];
		this.errorChain = [];
		this.catchChain = [];
	}

	/*
 type taskFnParam = {
 	error: (err?: any) => void;
 	next: (data?: any, label?: string) => void;
 	count: (c: number) => void;
 	data: any;
 }
 
 type taskFn = (param: taskFnParam) => void;
 
 then(task: string | TaskFn | Lightflow, context?: any, ...): this
 */
	then() {
		for (var _len = arguments.length, params = Array(_len), _key = 0; _key < _len; _key++) {
			params[_key] = arguments[_key];
		}

		const taskList = createTaskList(this, params);
		const maxCount = taskList.length;

		if (maxCount) {
			this.stepChain.push({ taskList, maxCount });
		}

		return this;
	}

	/*
 race (task: string | TaskFn | Lightflow, context?: any, ...): this
 */
	race() {
		for (var _len2 = arguments.length, params = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
			params[_key2] = arguments[_key2];
		}

		const taskList = createTaskList(this, params);
		const maxCount = 1;

		if (taskList.length) {
			this.stepChain.push({ taskList, maxCount });
		}

		return this;
	}

	error(task, context) {
		const idx = this.stepChain.length - 1;

		this.errorChain.push({ task, context, idx });
		return this;
	}

	catch(task, context) {
		const idx = this.stepChain.length - 1;

		this.catchChain.push({ task, context, idx });
		return this;
	}

	done(task, context) {
		this.doneChain.push({ task, context });
		return this;
	}

	loop(flag) {
		this.looped = flag === undefined ? true : flag;
		return this;
	}

	start(data) {
		if (this.active) {
			return this;
		}

		this.active = true;
		this.idx = -1;

		process(this, data);
		return this;
	}

	stop(task, context) {
		if (this.active) {
			this.active = false;
			if (task) {
				this.stopTask = { task, context };
			}
		}
		return this;
	}
}

module.exports = exports['default'];
