import test from 'ava';

export default function (title, lightflow) {
	const simpleAsync = fn => setTimeout(fn, 1);
	const randomAsync = (range, fn) => setTimeout(fn, 1 + Math.random() * (range - 1));
	const fixAsync = (timeout, fn) => setTimeout(fn, timeout);
	const label = `lightflow:${title}`;

	test(`${label}: object create`, t => {
		t.truthy(lightflow());
	});

	test(`${label}: object api check`, t => {
		const flow = lightflow();
		const check = fn => t.is(typeof flow[fn], 'function', `check .${fn} func`);

		['then', 'race', 'error', 'catch', 'done', 'loop', 'start', 'stop'].forEach(check);
	});

	test.cb(`${label}: trivial flow`, t => {
		t.plan(1);

		const ret = 3;

		lightflow()
		.then(({ next }) => next(ret))
		.done(data => {
			t.is(data, ret);
			t.end()
		})
		.start()
		;
	});

	test.cb(`${label}: trivial flow with data traverce`, t => {
		t.plan(1);

		const ret = 3;

		lightflow()
		.then(({ next, data }) => next(data))
		.done(data => {
			t.is(data, ret);
			t.end();
		})
		.start(ret)
		;
	});

	test.cb(`${label}: nested flows`, t => {
		t.plan(1);

		const ret = 3;

		lightflow()
		.then(
			lightflow()
			.then(({ next, data}) => simpleAsync(() => next(data)))
		)
		.done(data => {
			t.is(data, ret);
			t.end();
		})
		.start(ret)
		;
	});

	test.cb(`${label}: parallel tasks`, t => {
		t.plan(1);

		const ret = 3;

		lightflow()
		.then(
			lightflow()
			.then(({ next, data}) => simpleAsync(() => next(data)))
		)
		.done(data => {
			t.is(data, ret);
			t.end();
		})
		.start(ret)
		;
	});

	test.cb(`${label}: '.race' simple test`, t => {
		t.plan(3);

		lightflow()
		.race(
			// first race task
			({ next, data }) => {
				randomAsync(50, () => {
					data.t1 = true;
					next(data);
				})
			},

			// second race task
			({ next, data }) => {
				randomAsync(50, () => {
					data.t2 = true;
					next(data);
				})
			}
		)
		.then(({ data, next }) => fixAsync(60, () => next(data)))
		.then(({ next, data }) => {
			const { a, t1, t2 } = data;
			t.is(a, 1, 'check data pass through');
			t.truthy(t1 || t2, 'never a one race functions done')
			t.truthy(!(t1 && t2), 'data from both race function come here!');
			t.end();

			next();
		})
		.start({ a: 1 })
		;
	});

	test.cb(`${label}: '.then' with some parallel tasks`, t => {
		t.plan(2);

		lightflow()
		.then(
			({ next, data }) => simpleAsync(() => next({ a: data + 1 })),
			({ next, data }) => simpleAsync(() => next({ b: data + 2 }))
		)
		.done(data => {
			t.is(data.a, 2);
			t.is(data.b, 3);
			t.end();
		})
		.start(1)
		;
	});

	test.cb(`${label}: check data fencing simple`, t => {
		t.plan(1);

		let data_1;
		let data_2_1;
		let data_2_2;

		lightflow()
		.then(
			({ next, data }) => simpleAsync(() => {
				data_1 = data;
				next(data);
			})
		)
		.then(
			({ next, data }) => simpleAsync(() => {
				data_2_1 = data;
				next(data);
			}),
			({ next, data }) => simpleAsync(() => {
				data_2_2 = data;
				next(data);
			})
		)
		.done(data => {
			t.true(data !== data_1 && data !== data_2_1 && data !== data_2_2);
			t.end();
		})
		.start({ somedata: 1})
		;
	});

	test.cb(`${label}: check data fencing`, t => {
		t.plan(3);

		lightflow()

		// first try to corrupt data object after step is ended
		.then(({ next, data}) => {
			data.step1 = 1;
			next(data);

			fixAsync(10, () => data.step1 = 100);
		})
		.then(({ next, data }) => {
			fixAsync(100, () => {
				t.is(data.step1, 1, 'data corrupted with prev step');
				next(data);
			});
		})

		// then try to corrupt data from parallel task on same step
		.then(
			({ next, data }) => fixAsync(1, () => {
				data.step2 = 2;
				next(data);
			}),
			({ next, data }) => fixAsync(100, () => {
				t.truthy(!data.step2, 'data corrupted from parallel task')
				next(data);
			})
		)

		// and the last one - try to corrupt data from concurent task
		.race(
			({ next, data }) => fixAsync(1, () => {
				data.step3 = 3;
				next(data);
			}),
			({ next, data }) => fixAsync(100, () => {
				t.truthy(!data.step3, 'data corrupted from concurent task')
				next(data);
			})
		)
		.then(({ next, data }) => fixAsync(150, () => {
			t.end();
			next(data);
		}))
		.start({})
		;
	});

	test.cb(`${label}: check data fencing disabling`, t => {
		t.plan(1);

		let data_1;
		let data_2_1;
		let data_2_2;

		lightflow({ datafencing: false })
		.then(
			({ next, data }) => simpleAsync(() => {
				data_1 = data;
				next(data);
			})
		)
		.then(
			({ next, data }) => simpleAsync(() => {
				data_2_1 = data;
				next(data);
			}),
			({ next, data }) => simpleAsync(() => {
				data_2_2 = data;
				next(data);
			})
		)
		.done(data => {
			t.true(data === data_1 && data === data_2_1 && data === data_2_2);
			t.end();
		})
		.start({ somedata: 1})
		;
	});

	test.cb(`${label}: check flow with labels`, t => {
		t.plan(1);

		lightflow()
		.then('label')
		.then(({ next }) => simpleAsync(() => next()))
		.then('another-label')
		.then(({ next }) => simpleAsync(() => next()))
		.then('last-label')
		.done(() => {
			t.pass();
			t.end();
		})
		.start()
		;
	});

	test.cb(`${label}: check single skip to label`, t => {
		t.plan(1);

		lightflow()
		.then(({ next }) => simpleAsync(() => next(null, 'label')))
		.then(({ next }) => {
			t.fail('can\'t get here');
			t.end();
			next();
		})
		.then('label')
		.then(({ next }) => {
			t.pass();
			t.end();
			next();
		})
		.start()
		;
	});

	test.cb(`${label}: '.error' with continue`, t => {
		t.plan(2);

		lightflow()
		.then(({ next }) => simpleAsync(() => next()))
		.then(({ error }) => simpleAsync(() => error()))
		.error(() => 1)
		.catch(() => {
			t.fail();
			t.end();
		})
		.then(({ next, data }) => {
			t.is(1, data);
			next();
		})
		.done(() => {
			t.pass();
			t.end();
		})
		.start()
		;
	});


	test.cb(`${label}: '.catch' api`, t => {
		t.plan(2);

		const errorMsg = 'error';

		lightflow()
		.then(({ error }) => simpleAsync(() => error(errorMsg)))
		.catch(e => {
			t.is(e, errorMsg);
		})
		.then(({ next }) => simpleAsync(() => next()))
		.catch(e => {
			t.is(e, errorMsg);
			t.end();
		})
		.done(() => {
			t.failed();
		})
		.start()
		;
	});


	test.cb(`${label}: '.loop' api`, t => {
		t.plan(1);

		let counter = 0;

		const flow = lightflow()
		.then(({ next }) => simpleAsync(() => {
			++counter;
			if (counter === 2) {
				flow.loop(false);
				t.pass();
				t.end();
			}

			next();
		}))
		.loop()
		.start()
		;
	});


	test.cb(`${label}: '.loop' api with data pass`, t => {
		t.plan(2);

		let counter = 0;
		const flow = lightflow()
		.then(({ next, data }) => simpleAsync(() => {
			t.is(data, 0, `data must be 0, but it is ${data}`);
			if (++counter === 2) {
				flow.loop(false);
				t.end();
			}

			next(data);
		}))
		.loop()
		.start(0)
		;
	});


	test.cb(`${label}: '.stop' api with callback`, t => {
		t.plan(1);

		const initial = 0;
		const final = 3;

		const flow = lightflow()
		.then(({ next, data }) => simpleAsync(() => next(++data)))
		.then(({ next, data }) => simpleAsync(() => next(++data)))
		.then(({ next, data }) => {
			simpleAsync(() => next(++data));
			flow.stop(last => {
				t.is(last, final);
				t.end();
			});
		})
		.then(({ next, data }) => simpleAsync(() => {
			t.fail('execute next task after stop called!');
			t.end();
			next(data);
		}))
		.start(initial)
		;
	});
}