Lightflow
===========

> A tiny Promise-inspired control flow library for browser and Node.js.

[![npm package](https://img.shields.io/npm/v/lightflow.svg?style=flat-square)](https://www.npmjs.org/package/lightflow)

## Introduction
Lightflow helps to run asynchronous code in synchronous way without the hassle.

### Usage
- Create an *lightflow* instance `lightflow()`.
- Describe your flow by adding a series of asynchronous functions - *steps* with `.then`, `.race`, `.error`, `.catch` and `.done`.
- And then start, stop, restart, and even loop the flow as much as you needed, passing the new data on each run with `.start`, `.stop` and `.loop`.

### Quick example
```js
import lightflow from 'lightflow';

lightflow()
.then(({ next, error, data }) => {
	const { filename } = data;
	fs.readFile(filename, (err, content) => err ? error(err) : next({ raw : content, filename }));
})
.then(({ next, error, data }) => {
	try {
		data.parsed = JSON.parse(data.raw);
		next(data);
	}
	catch (err) {
		error(err);
	}
})
.done(data => {
	console.log(`This is content of ${data.filename}: ${data.parsed}`);
})
.catch(err => {
	console.log(`Error: ${err}`);
})
.start({ filename : 'file.json' })
;
```

### Differences from Promise
- Simpler API.
- When you run asynchronous functions with callbacks, you should not care about promisification. Simply use them in your flow.
- Lightflow is not for one-time execution thing. Once you described it, you can start, stop and restart it many times.

## Installation
### Browser
```shell
git clone https://github.com/saperio/lightflow.git
```
Use UMD module located in [dist](dist/)
```html
<script src="lightflow.min.js"></script>
```
or just
```html
<script src="https://unpkg.com/lightflow/dist/lightflow.min.js"></script>
```

### Node.js
```shell
npm install lightflow --save
```
#### Node.js version >= 6.5
```js
var lightflow = require('lightflow');
```

#### Node.js version >= 4.x
```js
var lightflow = require('lightflow/lib/lts');
```

#### Node.js version >= 0.x
```js
var lightflow = require('lightflow/lib/0.x');
```

## API

* [`lightflow`](#lightflow-1)
* [`.then`](#then)
* [`.race`](#race)
* [`.error`](#error)
* [`.catch`](#catch)
* [`.done`](#done)
* [`.start`](#start)
* [`.stop`](#stop)
* [`.loop`](#loop)

All api function are divided in two groups: functions for describe the flow and functions for control the flow. Functions in the first group accept one or more tasks (with optional contexts). All of them return `this` for handy chaining.

### lightflow
```js
lightflow(params?: {
	datafencing?: boolean
})
```
Use `lightflow()` to create new flow instance. You can pass optional parameters object with some (just one for now) flags:
* datafencing - (default - true) copy data object between steps and parallel tasks to prevent corrupting it in one task from another.

### .then
```js
.then(task: string | TaskFn | Lightflow, context?: any, ...): this
type taskFn = (param: taskFnParam) => void
type taskFnParam = {
	error: (err?: any) => void;
	next: (data?: any, label?: string) => void;
	count: (c: number) => void;
	data: any;
}
```
#### Overview
`.then` adds one or more tasks (with optional contexts) to the flow. If first parameter is a string, then other parameters are ignored and this step used as label. All the tasks run in parallel, their output data objects are merged and passed to the next step. Each task can be function or another Lightflow instance.

#### Task function parameters
Task function will receive single parameter with this fields:
- `next` - function to be called, when task is finished. Can take data for the next step.
- `error` - function to be called, when error occurred. You can pass error object to it.
- `count` - function, can be used to indicate how many times task assume to call `next` before flow marks this task as complete. If not called - flow will accept only one `next` call and ignore results from the others from within current task.
- `data` - data object from previous step.

#### Labels
With the labels, you can mark steps in the flow, which you can jump to from one step, ignore the others. Labels are added to the flow in this way: `.then ('somelabel')`, so we created a label named *somelabel*. To jump to this label, you need to call the function `next` inside the task with two parameters: data object, as usual, and the label name - `next (data, 'somelabel');`. If you pass the nonexistent label, then there will be no jump, the next step will be executed. Using labels you can jump only forward, this is done in order not to create an infinite loop. If you need to loop your flow, use [`.loop`](#loop).


#### Examples
Simple, one step flow
```js
lightflow()
.then(({ next, error, data }) => {
	doAsync(data, (err, out) => {
		if (err) {
			error(e);
		} else {
			next(out);
		}
	});
})
.start(somedata)
;
```

Here example with two parallel tasks on one step:
```js
lightflow()
.then(
	({ next, data }) => {
		fetchUrl(data.url, remote => next({ remote }));
	},
	({ next, error, data }) => {
		fs.readFile(data.filename, (err, local) => err ? error(err) : next({ local }));
	}
)
.then(({ next, data }) => {
	const { remote, local } = data;
	// ... use remote and local
	next();
})
.start({
	url: 'google.com',
	filename: 'config.json'
})
;
```

In the following example task gets a list of filenames, reads files in parallel and passes results into a list of strings.
If you comment `count(data.length);` line, all files will be read but only content of the first one will be passed to the next step.
```js
lightflow()
.then(({ next, count, data }) => {
	let res = [];
	// data - array with filenames
	count(data.length);
	data.forEach(filename => {
		fs.readFile(filename, (err, content) => {
			res.push(content);
			next(res);
		});
	});
})
.then(({ next, data }) => {
	// here data - is array of files contents
	next();
})
.start(['file1.json', 'file2.json'])
;
```

Labels example:
```js
lightflow()
.then(({ next, data }) => {
	next(data, 'jumphere')
})
.then(({ next, data }) => {
	// never get here
})
.then('jumphere')
.then(({ next, data }) => {
	// and here we are
	next(data);
})
.start()
;
```

Use one flow as task in another flow:
```js
const parse = lightflow()
.then(({ next, error, data }) => {
	doParse(data.raw, (err, parsed) => err ? error(err) : next({ parsed }));
})
;

lightflow()
.then(({ next, data }) => {
	fetchUrl(data.url, raw => next({ raw }));
})
.then(parse)
.then(({ next, data }) => {
	const { parsed } = data;
	// use parsed
	next(data);
})
.start({ url: 'google.com' })
;
```

### .race
```js
.race(task: string | TaskFn | Lightflow, context?: any, ...): this
type taskFn = (param: taskFnParam) => void
type taskFnParam = {
	error: (err?: any) => void;
	next: (data?: any, label?: string) => void;
	count: (c: number) => void;
	data: any;
}
```

`.race` same as `.then`, except that the result only from the first completed task used for the next step.
```js
lightflow()
.race(
	// first race task
	({ next, data }) => {
		setTimeout(() => {
			data.t1 = true;
			next(data);
		}, 50)
	},

	// second race task
	({ next, data }) => {
		setTimeout(() => {
			data.t2 = true;
			next(data);
		}, 100)
	}
)
// wait a little longer
.then(({ next, data }) => setTimeout(() => next(data), 100))
.then(({ next, data }) => {
	const { t1, t2 } = data;
	// here t1 === true and t2 === undefined
	next();
})
.start({})
;
```

### .error
```js
.error(handler: ErrorFn, context?: any): this
type ErrorFn = (param?: any) => any
```

Adds an error handler for the preceding step. Triggered when error occurs in the step it follows. Can be added many times. As a parameter gets the object passed to the `error` function. If handler returns something non-undefined, flow will continue and use this object as data for next step, otherwise flow will stop.

In the next example error is handled only from `doAsync2`, not from `doAsync1`.
```js
lightflow()
.then(({ next, error }) => {
	doAsync1(err => err ? error(err) : next());
})
.then(({ next, error }) => {
	doAsync2(err => err ? error(err) : next());
})
.error(e => {
	console.log(`Error: ${e}`);
})
.start()
;
```

### .catch
```js
.catch(handler: CatchFn, context?: any): this
type CatchFn = (param?: any) => void
```

Adds an error handler to the flow. Catches errors from the **all** steps added before the `catch`. Can be added many times. As a parameter gets the object passed to the `error` function.

In the following example error is handled from both `doAsync2` and `doAsync1`.
```js
lightflow()
.then(({ next, error }) => {
	doAsync1(err => err ? error(err) : next());
})
.then(({ next, error }) => {
	doAsync2(err => err ? error(err) : next());
})
.catch(e => {
	console.log(`Error: ${e}`);
})
.start()
;
```

### .done
```js
.done(task: DoneFn, context?: any): this
type DoneFn = (data: any) => void
```

Adds a final task to the flow. Regardless of where it's defined, called after **all** other steps, if errors don't occur. Can be added many times. Task function gets data from last step.

```js
lightflow()
.done(data => {
	console.log(data);
})
.then(({ next }) => {
	doAsync(out => next(out));
})
.start()
;
```

### .start
```js
.start(data?: any): this
```
Starts the flow. Takes optional data object, pass it to the first step.


### .stop
```js
.stop(handler?: StopFn, context?: any): this
type StopFn = (data?: any) => void
```
Stops the flow processing. Can take optional `handler` parameter (and it's `context`). This optional handler is called when current step is finished and output data is received from it.

In the following example the output from `doAsync1` will be printed to the console.
```js
const flow = lightflow()
.then(({ next }) => {
	doAsync1(out => next(out));
})
.then(({ next }) => {
	doAsync2(out => next(out));
})
.start()
;

flow.stop(data => {
	console.log(data);
})
```

### .loop
```js
.loop(flag?: boolean): this
```
Sets loop flag for the flow. If set, after call `start` flow do not stop after all steps processed and starts from first step, until `stop` called. Call `loop(false)` and flow will stop after last step.

This code prints increasing by one number every second:
```js
lightflow()
.then(({ next, data }) => {
	setTimeout(() => next(++data), 1000);
})
.then(({ next, data }) => {
	console.log(data);
	next(data);
})
.loop()
.start(0)
;
```

## Build and test
```shell
npm install
npm run build
npm run test
```

## License
MIT