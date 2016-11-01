const process = function (flow, data) {
	if (!flow.active) {
		const fn = flow.stop_fn;
		if (fn) {
			fn.task.call(fn.context, data);
			flow.stop_fn = undefined;
		}
		return;
	}

	if (++flow.idx < flow.taskChain.length) {
		flow.taskChain[flow.idx].processFn(flow, data);
	} else {
		flow.stop();
		flow.doneChain.forEach(item => item.task.call(item.context, data));

		if (flow.looped) {
			flow.start();
		}
	}
};

const processOne = function (flow, data) {
	const item = flow.taskChain[flow.idx];
	if (item.task instanceof Lightflow) {
		item.task
		.done(d => process(flow, d))
		.catch(err => processError(flow, err))
		.loop(false)
		.start(data)
		;
	} else {
		item.task.call(
			item.context, {
				next : d => process(flow, d),
				error : err => processError(flow, err),
				data
			}
		);
	}
};

const processMany = function (flow, data) {
	const item = flow.taskChain[flow.idx];
	let ret = [];
	let counter = item.task.map(() => 1);
	item.task.forEach((task, idx) => {
		task.task.call(
			task.context,
			{
				count : max => counter[idx] = max,
				next : d => {
					if(--counter[idx] >= 0) {
						ret.push(d);
					}
					if (!flow.active || counter.every(c => c <= 0)) {
						process(flow, ret);
					}
				},
				error : err => processError(flow, err),
				data
			}
		);
	});
};

const processError = function (flow, err) {
	const canContinue = flow.errorChain
	.filter(item => item.idx === flow.idx)
	.reduce(
		(prev, item) => item.task.call(item.context, err) || prev,
		false
	)
	;

	if (canContinue) {
		process(flow);
	} else {
		flow.stop();
		flow.catchChain
		.filter(item => item.idx >= flow.idx)
		.forEach(item => item.task.call(item.context, err))
		;
	}
}


class Lightflow {
	constructor () {
		this.taskChain = [];
		this.doneChain = [];
		this.errorChain = [];
		this.catchChain = [];

		this.idx = -1;
		this.active = false;
		this.looped = false;
	}

	then (task, context) {
		this.taskChain.push({ task, context, processFn : processOne });
		return this;
	}

	with (...args) {
		let taskList = [];
		args.forEach(a => {
			if (typeof a === 'function') {
				taskList.push({ task : a });
			} else if (taskList.length) {
				taskList[taskList.length - 1].context = a;
			}
		});

		this.taskChain.push({ task : taskList, processFn : processMany });
		return this;
	}

	error (task, context) {
		this.errorChain.push({ task, context, idx : this.taskChain.length - 1 });
		return this;
	}

	catch (task, context) {
		this.catchChain.push({ task, context, idx : this.taskChain.length - 1 });
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
			this.stop_fn = { task, context };
		}
		return this;
	}
}

export default function () {
	return new Lightflow();
};