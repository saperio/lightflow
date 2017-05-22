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