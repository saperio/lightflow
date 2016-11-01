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

	exports.default = function () {
		return new Lightflow();
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

	var process = function process(flow) {
		for (var _len = arguments.length, data = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
			data[_key - 1] = arguments[_key];
		}

		if (!flow.active) {
			var fn = flow.stop_fn;
			if (fn) {
				var _fn$task;

				(_fn$task = fn.task).call.apply(_fn$task, [fn.context].concat(data));
				flow.stop_fn = undefined;
			}
			return;
		}

		if (++flow.idx < flow.taskChain.length) {
			var _flow$taskChain$flow$;

			(_flow$taskChain$flow$ = flow.taskChain[flow.idx]).processFn.apply(_flow$taskChain$flow$, [flow].concat(data));
		} else {
			flow.stop();
			flow.doneChain.forEach(function (item) {
				var _item$task;

				return (_item$task = item.task).call.apply(_item$task, [item.context].concat(data));
			});

			if (flow.looped) {
				flow.start();
			}
		}
	};

	var processOne = function processOne(flow) {
		var item = flow.taskChain[flow.idx];

		for (var _len2 = arguments.length, data = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
			data[_key2 - 1] = arguments[_key2];
		}

		if (item.task instanceof Lightflow) {
			var _item$task$done$catch;

			(_item$task$done$catch = item.task.done(function () {
				for (var _len3 = arguments.length, args = Array(_len3), _key3 = 0; _key3 < _len3; _key3++) {
					args[_key3] = arguments[_key3];
				}

				return process.apply(undefined, [flow].concat(args));
			}).catch(function (err) {
				return processError(flow, err);
			}).loop(false)).start.apply(_item$task$done$catch, data);
		} else {
			var _item$task2;

			(_item$task2 = item.task).call.apply(_item$task2, [item.context, function () {
				for (var _len4 = arguments.length, args = Array(_len4), _key4 = 0; _key4 < _len4; _key4++) {
					args[_key4] = arguments[_key4];
				}

				return process.apply(undefined, [flow].concat(args));
			}, function (err) {
				return processError(flow, err);
			}].concat(data));
		}
	};

	var processMany = function processMany(flow) {
		for (var _len5 = arguments.length, data = Array(_len5 > 1 ? _len5 - 1 : 0), _key5 = 1; _key5 < _len5; _key5++) {
			data[_key5 - 1] = arguments[_key5];
		}

		var item = flow.taskChain[flow.idx];
		var ret = [];
		var counter = item.task.map(function () {
			return 1;
		});
		item.task.forEach(function (task, idx) {
			var _task$task;

			(_task$task = task.task).call.apply(_task$task, [task.context, function (max) {
				return counter[idx] = max;
			}, function () {
				for (var _len6 = arguments.length, args = Array(_len6), _key6 = 0; _key6 < _len6; _key6++) {
					args[_key6] = arguments[_key6];
				}

				if (--counter[idx] >= 0) {
					ret.push(args);
				}
				if (!flow.active || counter.every(function (c) {
					return c <= 0;
				})) {
					process(flow, ret);
				}
			}, function (err) {
				return processError(flow, err);
			}].concat(data));
		});
	};

	var processError = function processError(flow, err) {
		var canContinue = flow.errorChain.filter(function (item) {
			return item.idx === flow.idx;
		}).reduce(function (prev, item) {
			return item.task.call(item.context, err) || prev;
		}, false);

		if (canContinue) {
			process(flow);
		} else {
			flow.stop();
			flow.catchChain.filter(function (item) {
				return item.idx >= flow.idx;
			}).forEach(function (item) {
				return item.task.call(item.context, err);
			});
		}
	};

	var Lightflow = function () {
		function Lightflow() {
			_classCallCheck(this, Lightflow);

			this.taskChain = [];
			this.doneChain = [];
			this.errorChain = [];
			this.catchChain = [];

			this.idx = -1;
			this.active = false;
			this.looped = false;
		}

		_createClass(Lightflow, [{
			key: 'then',
			value: function then(task, context) {
				this.taskChain.push({ task: task, context: context, processFn: processOne });
				return this;
			}
		}, {
			key: 'with',
			value: function _with() {
				var taskList = [];

				for (var _len7 = arguments.length, args = Array(_len7), _key7 = 0; _key7 < _len7; _key7++) {
					args[_key7] = arguments[_key7];
				}

				args.forEach(function (a) {
					if (typeof a === 'function') {
						taskList.push({ task: a });
					} else if (taskList.length) {
						taskList[taskList.length - 1].context = a;
					}
				});

				this.taskChain.push({ task: taskList, processFn: processMany });
				return this;
			}
		}, {
			key: 'error',
			value: function error(task, context) {
				this.errorChain.push({ task: task, context: context, idx: this.taskChain.length - 1 });
				return this;
			}
		}, {
			key: 'catch',
			value: function _catch(task, context) {
				this.catchChain.push({ task: task, context: context, idx: this.taskChain.length - 1 });
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
			value: function start() {
				if (this.active) {
					return;
				}

				this.active = true;
				this.idx = -1;

				for (var _len8 = arguments.length, data = Array(_len8), _key8 = 0; _key8 < _len8; _key8++) {
					data[_key8] = arguments[_key8];
				}

				process.apply(undefined, [this].concat(data));
				return this;
			}
		}, {
			key: 'stop',
			value: function stop(task, context) {
				if (this.active) {
					this.active = false;
					this.stop_fn = { task: task, context: context };
				}
				return this;
			}
		}]);

		return Lightflow;
	}();

	;
});
