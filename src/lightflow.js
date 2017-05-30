/*
.then(task: string | TaskFn | Lightflow, context?: any, ...)
.race(task: string | TaskFn | Lightflow, context?: any, ...)

type taskFnParam = {
	error: (err?: any) => void;
	next: (data?: any, label?: string) => void;
	count: (c: number) => void;
	data: any;
}

type taskFn = (param: taskFnParam) => void;

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
	maxCount?: number;
	storage: any;
}

.then(
	({ next, data, count }) => {
		count(10);
		// read some io
	},
	({ next, data, count }) => {
		read another io
	}
)
*/

/* todo
- place throws
- add comments
- update readme
- update tests
*/


/**
 * extend target with src or clone src if no target
 * @param  {object} target target object, can be undefined
 * @param  {object} src    source object
 * @return {object}        return target or new object if target is undefined
 */
const extend = function (target, src) {
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

const process = function (flow, data, label) {
	// check flow is done and call stopTask if needed
	if (!flow.active) {
		if (flow.stopTask) {
			let { task, context } = flow.stopTask;
			task.call(context, data);
			flow.stopTask = undefined;
		}
		return;
	}

	const { datafencing } = flow.flags;

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
		for (let i = 0; i < flow.stepChain.length; ++i) {
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

const processTaskLabel = function (flow, taskDesc, data) {
	process(flow, data);
};

const processTaskFunction = function (flow, taskDesc, data) {
	const { task, context } = taskDesc;
	const { stepId } = flow;
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
	const count = maxCount => taskDesc.maxCount = maxCount;

	task.call(context, { next, error, count, data });
};

const processTaskFlow = function (flow, taskDesc, data) {
	const { task } = taskDesc;

	task
	.loop(false)
	.start(data)
	;
};

const processError = function (flow, err) {
	const continueData = flow.errorChain
	.filter(item => item.idx === flow.idx)
	.reduce(
		(prev, item) => {
			const data = item.task.call(item.context, err);
			if (data !== undefined) {
				return data;
			}

			return prev;
		},
		undefined
	)
	;

	if (continueData !== undefined) {
		// update currentCount in current step
		// to proceed to the next step
		flow.stepChain[flow.idx].currentCount = flow.stepChain[flow.idx].maxCount;
		process(flow, continueData);
	} else {
		flow.stop();
		flow.catchChain
		.filter(item => item.idx >= flow.idx)
		.forEach(item => item.task.call(item.context, err))
		;
	}
};

const createTaskList = function (flow, params) {
	const taskList = [];

	if (!params) {
		return taskList;
	}

	if (typeof params[0] === 'string') {
		taskList.push({
			label : params[0],
			processTaskFn : processTaskLabel
		});
	} else {
		params.forEach(param => {
			if (typeof param === 'function') {
				taskList.push({
					task : param,
					processTaskFn : processTaskFunction
				});
			} else if (param instanceof Lightflow) {
				let stepIdx = flow.stepChain.length;

				param
				.done(nextData => {
					if (flow.stepChain[stepIdx].stepId === flow.stepId) {
						process(flow, nextData);
					}
				})
				.catch(err => {
					if (flow.stepChain[stepIdx].stepId === flow.stepId) {
						processError(flow, err);
					}
				})
				;

				taskList.push({
					task : param,
					processTaskFn : processTaskFlow
				});
			} else if (taskList.length) {
				taskList[taskList.length - 1].context = param;
			}
		});
	}

	return taskList;
};

class Lightflow {
	constructor ({ datafencing }) {
		this.flags = {
			datafencing: datafencing === undefined || !!datafencing
		};
		this.stepId = 0;
		this.idx = -1;
		this.active = false;
		this.looped = false;

		this.stepChain = [];
		this.doneChain = [];
		this.errorChain = [];
		this.catchChain = [];
	}

	then (...params) {
		const taskList = createTaskList(this, params);
		const maxCount = taskList.length;

		if (maxCount) {
			this.stepChain.push({ taskList, maxCount });
		}

		return this;
	}

	race (...params) {
		const taskList = createTaskList(this, params);
		const maxCount = 1;

		if (taskList.length) {
			this.stepChain.push({ taskList, maxCount });
		}

		return this;
	}

	error (task, context) {
		const idx = this.stepChain.length - 1;

		this.errorChain.push({ task, context, idx });
		return this;
	}

	catch (task, context) {
		const idx = this.stepChain.length - 1;

		this.catchChain.push({ task, context, idx });
		return this;
	}

	done (task, context) {
		this.doneChain.push({ task, context });
		return this;
	}

	loop (flag) {
		this.looped = flag === undefined ? true : flag;
		return this;
	}

	start (data) {
		if (this.active) {
			return;
		}

		this.active = true;
		this.idx = -1;

		process(this, data);
		return this;
	}

	stop (task, context) {
		if (this.active) {
			this.active = false;
			if (task) {
				this.stopTask = { task, context };
			}
		}
		return this;
	}
}

export default function (params) {
	return new Lightflow(params || {});
}