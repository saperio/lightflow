(function (global, factory) {
	if (typeof define === "function" && define.amd) {
		define(['exports'], factory);
	} else if (typeof exports !== "undefined") {
		factory(exports);
	} else {
		var mod = {
			exports: {}
		};
		factory(mod.exports);
		global.lightflow = mod.exports;
	}
})(this, function (exports) {
	'use strict';

	Object.defineProperty(exports, "__esModule", {
		value: true
	});

	exports.default = function (params) {
		return new Lightflow(params || {});
	};

	function _classCallCheck(instance, Constructor) {
		if (!(instance instanceof Constructor)) {
			throw new TypeError("Cannot call a class as a function");
		}
	}

	var _createClass = function () {
		function defineProperties(target, props) {
			for (var i = 0; i < props.length; i++) {
				var descriptor = props[i];
				descriptor.enumerable = descriptor.enumerable || false;
				descriptor.configurable = true;
				if ("value" in descriptor) descriptor.writable = true;
				Object.defineProperty(target, descriptor.key, descriptor);
			}
		}

		return function (Constructor, protoProps, staticProps) {
			if (protoProps) defineProperties(Constructor.prototype, protoProps);
			if (staticProps) defineProperties(Constructor, staticProps);
			return Constructor;
		};
	}();

	var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
		return typeof obj;
	} : function (obj) {
		return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj;
	};

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
	var extend = function extend(target, src) {
		if (src === null || (typeof src === 'undefined' ? 'undefined' : _typeof(src)) !== 'object') {
			return src;
		}

		var needInit = (typeof target === 'undefined' ? 'undefined' : _typeof(target)) !== (typeof src === 'undefined' ? 'undefined' : _typeof(src)) || target instanceof Array !== src instanceof Array;

		if (src instanceof Array) {
			target = needInit ? [] : target;
			for (var i = 0; i < src.length; ++i) {
				target[i] = extend(target[i], src[i]);
			}
			return target;
		}

		if ((typeof src === 'undefined' ? 'undefined' : _typeof(src)) === 'object') {
			target = needInit ? {} : target;
			for (var attr in src) {
				if (src.hasOwnProperty(attr)) {
					target[attr] = extend(target[attr], src[attr]);
				}
			}
			return target;
		}

		return src;
	};

	var process = function process(flow, data, label) {
		// check flow is done and call stopTask if needed
		if (!flow.active) {
			if (flow.stopTask) {
				var _flow$stopTask = flow.stopTask;
				var task = _flow$stopTask.task;
				var context = _flow$stopTask.context;

				task.call(context, data);
				flow.stopTask = undefined;
			}
			return;
		}

		// check if all tasks of current step is done
		var nextData = data;
		if (flow.idx >= 0) {
			var curStep = flow.stepChain[flow.idx];
			if (++curStep.currentCount < curStep.maxCount) {
				curStep.storage = extend(curStep.storage, data);
				return;
			}

			if (curStep.storage) {
				nextData = extend(curStep.storage, data);
				curStep.storage = null;
			}
		}

		// check if we need skip to specific step
		if (typeof label === 'string') {
			for (var i = 0; i < flow.stepChain.length; ++i) {
				if (flow.stepChain[i].taskList[0].label === label) {
					flow.idx = i;
					break;
				}
			}
		}

		// process next step
		if (++flow.idx < flow.stepChain.length) {
			var nextStep = flow.stepChain[flow.idx];

			++flow.stepId;

			nextStep.stepId = flow.stepId;
			nextStep.currentCount = 0;
			nextStep.taskList.forEach(function (taskDesc) {
				taskDesc.currentCount = 0;
				taskDesc.maxCount = 1;
				taskDesc.processTaskFn(flow, taskDesc, extend(undefined, nextData));
			});
		} else {
			flow.stop();
			flow.doneChain.forEach(function (item) {
				return item.task.call(item.context, nextData);
			});

			if (flow.looped) {
				flow.start(nextData);
			}
		}
	};

	var processTaskLabel = function processTaskLabel(flow, taskDesc, data) {
		process(flow, data);
	};

	var processTaskFunction = function processTaskFunction(flow, taskDesc, data) {
		var task = taskDesc.task;
		var context = taskDesc.context;
		var stepId = flow.stepId;

		var next = function next(nextData, label) {
			// first check if flow still on this stepId
			// and then - if this task is done
			if (stepId === flow.stepId && ++taskDesc.currentCount >= taskDesc.maxCount) {
				process(flow, nextData, label);
			}
		};
		var error = function error(err) {
			// check if flow still on this stepId
			if (stepId === flow.stepId) {
				processError(flow, err);
			}
		};
		var count = function count(maxCount) {
			return taskDesc.maxCount = maxCount;
		};

		task.call(context, { next: next, error: error, count: count, data: data });
	};

	var processTaskFlow = function processTaskFlow(flow, taskDesc, data) {
		var task = taskDesc.task;


		task.loop(false).start(data);
	};

	var processError = function processError(flow, err) {
		var continueData = flow.errorChain.filter(function (item) {
			return item.idx === flow.idx;
		}).reduce(function (prev, item) {
			var data = item.task.call(item.context, err);
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
			flow.catchChain.filter(function (item) {
				return item.idx >= flow.idx;
			}).forEach(function (item) {
				return item.task.call(item.context, err);
			});
		}
	};

	var createTaskList = function createTaskList(flow, params) {
		var taskList = [];

		if (!params) {
			return taskList;
		}

		if (typeof params[0] === 'string') {
			taskList.push({
				label: params[0],
				processTaskFn: processTaskLabel
			});
		} else {
			params.forEach(function (param) {
				if (typeof param === 'function') {
					taskList.push({
						task: param,
						processTaskFn: processTaskFunction
					});
				} else if (param instanceof Lightflow) {
					(function () {
						var stepIdx = flow.stepChain.length;

						param.done(function (nextData) {
							if (flow.stepChain[stepIdx].stepId === flow.stepId) {
								process(flow, nextData);
							}
						}).catch(function (err) {
							if (flow.stepChain[stepIdx].stepId === flow.stepId) {
								processError(flow, err);
							}
						});

						taskList.push({
							task: param,
							processTaskFn: processTaskFlow
						});
					})();
				} else if (taskList.length) {
					taskList[taskList.length - 1].context = param;
				}
			});
		}

		return taskList;
	};

	var Lightflow = function () {
		function Lightflow(_ref) {
			var nothrow = _ref.nothrow;

			_classCallCheck(this, Lightflow);

			this.nothrow = !!nothrow;
			this.stepId = 0;
			this.idx = -1;
			this.active = false;
			this.looped = false;

			this.stepChain = [];
			this.doneChain = [];
			this.errorChain = [];
			this.catchChain = [];
		}

		_createClass(Lightflow, [{
			key: 'then',
			value: function then() {
				for (var _len = arguments.length, params = Array(_len), _key = 0; _key < _len; _key++) {
					params[_key] = arguments[_key];
				}

				var taskList = createTaskList(this, params);
				var maxCount = taskList.length;

				if (maxCount) {
					this.stepChain.push({ taskList: taskList, maxCount: maxCount });
				}

				return this;
			}
		}, {
			key: 'race',
			value: function race() {
				for (var _len2 = arguments.length, params = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
					params[_key2] = arguments[_key2];
				}

				var taskList = createTaskList(this, params);
				var maxCount = 1;

				if (taskList.length) {
					this.stepChain.push({ taskList: taskList, maxCount: maxCount });
				}

				return this;
			}
		}, {
			key: 'error',
			value: function error(task, context) {
				var idx = this.stepChain.length - 1;

				this.errorChain.push({ task: task, context: context, idx: idx });
				return this;
			}
		}, {
			key: 'catch',
			value: function _catch(task, context) {
				var idx = this.stepChain.length - 1;

				this.catchChain.push({ task: task, context: context, idx: idx });
				return this;
			}
		}, {
			key: 'done',
			value: function done(task, context) {
				this.doneChain.push({ task: task, context: context });
				return this;
			}
		}, {
			key: 'loop',
			value: function loop(flag) {
				this.looped = flag === undefined ? true : flag;
				return this;
			}
		}, {
			key: 'start',
			value: function start(data) {
				if (this.active) {
					return;
				}

				this.active = true;
				this.idx = -1;

				process(this, data);
				return this;
			}
		}, {
			key: 'stop',
			value: function stop(task, context) {
				if (this.active) {
					this.active = false;
					if (task) {
						this.stopTask = { task: task, context: context };
					}
				}
				return this;
			}
		}]);

		return Lightflow;
	}();
});
