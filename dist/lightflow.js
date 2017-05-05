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

	var process = function process(flow, data) {
		if (!flow.active) {
			var fn = flow.stop_fn;
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
			flow.doneChain.forEach(function (item) {
				return item.task.call(item.context, data);
			});

			if (flow.looped) {
				flow.start(data);
			}
		}
	};

	var processInternal = function processInternal(flow, data) {
		var task = flow.taskChain[flow.idx].task;


		task.loop(false).start(data);
	};

	var processOne = function processOne(flow, data) {
		var _flow$taskChain$flow$ = flow.taskChain[flow.idx];
		var task = _flow$taskChain$flow$.task;
		var context = _flow$taskChain$flow$.context;

		task.call(context, {
			next: function next(nextData) {
				return process(flow, nextData);
			},
			error: function error(err) {
				return processError(flow, err);
			},
			data: data
		});
	};

	var processMany = function processMany(flow, data) {
		var item = flow.taskChain[flow.idx];
		var ret = [];
		var counter = item.task.map(function () {
			return 1;
		});
		item.task.forEach(function (task, idx) {
			task.task.call(task.context, {
				count: function count(max) {
					return counter[idx] = max;
				},
				next: function next(d) {
					if (--counter[idx] >= 0) {
						ret.push(d);
					}
					if (!flow.active || counter.every(function (c) {
						return c <= 0;
					})) {
						process(flow, ret);
					}
				},
				error: function error(err) {
					return processError(flow, err);
				},
				data: data
			});
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
				var _this = this;

				var processFn = void 0;
				if (task instanceof Lightflow) {
					task.done(function (nextData) {
						return process(_this, nextData);
					}).catch(function (err) {
						return processError(_this, err);
					});
					processFn = processInternal;
				} else {
					processFn = processOne;
				}

				this.taskChain.push({ task: task, context: context, processFn: processFn });
				return this;
			}
		}, {
			key: 'with',
			value: function _with() {
				var taskList = [];

				for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
					args[_key] = arguments[_key];
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
						this.stop_fn = { task: task, context: context };
					}
				}
				return this;
			}
		}]);

		return Lightflow;
	}();

	;
});
