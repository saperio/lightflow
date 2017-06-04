Lightflow
===========

> A tiny Promise-inspired control flow library for browser and Node.js.

[![npm package](https://img.shields.io/npm/v/lightflow.svg?style=flat-square)](https://www.npmjs.org/package/lightflow)

## Introduction
Lightflow helps to run asynchronous code in synchronous way without the hassle.

### Usage
To create your flow use `.then`, `.race`, `.error`, `.catch` and `.done` functions. Operate it with `.start`, `.stop` and `.loop`.

### Quick example
```js
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
- Lightflow is not for one-time execution. Once you described it, you can start, stop, restart or even loop it.

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

* [`lightflow`](lightflow)
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
Use `lightflow()` to create new flow instance, you can pass optional params object with some (just one for now) flags:
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
`.then` adds one or more tasks (with optional contexts) to the chain. If first task is a string, then other parameters are ignored and this step used as label. Else all the tasks run in parallel, their output data objects are merged and passed to the next step. Each task can be function or another Lightflow instance.
Task function will receive single parameter with this fields:
- `next` - function to be called, when task is finished. Can take data for the next task.
- `error` - function to be called, when error occurred. You can pass error object to it.
- `count` - function, can be used to indicate how many times task assume to call `next` before flow marks this task as complete. If not called - `.then` will accept only one `next` call and ignore results from the others.
- `data` - data object from previous task.

Example:

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

Here example with two parallel task on one step:
```js
lightflow()
.then(
	({ next, error, data }) => {

	},
	({ next, error, data }) => {

	}
)
.start()
;
```

### .race
`.race (task[, context], ...)`

```js
task({ next, error, data, count }) // classical
task(count, next, error[, data], ...) // flat
```

Adds several tasks for parallel execution. Task function params:
- `count` - function, can be used to indicate how many times task assume to call `next` before flow switch to the next task. If not called - `.race` will accept only one `next` call and ignore results from the others.
- `next` - function to be called, when task is finished. Can take data for the next task.
- `error` - function to be called, when error occurs. You can pass error object to it.
- `data` - data object from previous task.


`.race` is designed to run several task functions asynchronously. To return a result from the single task `next` function should be called. All results will be combined into an array and passed to the next flow task.


In the following example task gets a list of filenames, reads files in parallel and passes results into a list of strings.
If you comment `count(data.length);` line all files will be read but only content of the first one will be passed to the next task.

```js
lightflow()
.with(({ next, count, data }) => {
	// data - array with filenames
	count(data.length);
	data.forEach(filename => {
		fs.readFile(filename, (err, content) => next(content));
	});
})
.then(({ next, data }) => {
	// here data - is array of files contents
	next();
})
.start(['file1.json', 'file2.json'])
;
```

More complex example with two functions and their specific contexts:
```js
const someObj = { ext : '.json' };
const otherObj = { ext : '.png' };

lightflow()
.with(
	({ next, count, data }) => {
		const list = data.filter(filename => path.extname(filename) === this.ext);

		count(list.length);
		list.forEach(filename => {
			jsonReadAndParse(filename, content => next(content));
		});
	},
	someObj,
	({ next, count, data }) => {
		const list = data.filter(filename => path.extname(filename) === this.ext);

		count(list.length);
		list.forEach(filename => {
			pngReadAndParseMetadata(filename, content => next(content));
		});
	},
	otherObj,
)
.start(['file1.json', 'file2.png'])
;
```

### .error
`.error (callback[, context])`

```js
callback(error) // classical and flat
```

Adds an error handler for the preceding task. Triggered when error occurs in the task it follows. Can be added many times.

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
If error's callback returns true, flow will continue processing tasks. Otherwise flow will stop.

### .catch
`.catch (callback[, context])`

```js
callback(error) // classical and flat
```

Adds an error handler to the chain. Catches errors from the all tasks added **before** the `catch`. Can be added many times.

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
`.done (task[, context])`

```js
task(data) // classical
task(data, ...) // flat
```

Adds a final task to the chain. Regardless of where it's defined, called after **all** other tasks, if errors don't occur. Can be added many times. Task function gets data from last task of the chain.

```js
lightflow()
.then(({ next }) => {
	doAsync(out => next(out));
})
.done(data => {
	console.log(data);
})
.start()
;
```

### .start
`.start ([data])`

Starts the flow. Takes optional data object, pass it to the first task.


### .stop
`.stop ([task][, context])`

```js
task(data) // classical
task(data, ...) // flat
```

Stops the flow processing. Can take optional `task` parameter (and it's `context`). This optional task is called when current task is finished and output data is received from it.

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
`.loop ([flag])`

Sets loop flag for the flow. If set, after call `start` flow do not stop after all tasks processed and starts from first task, until `stop` called. Call `loop(false)` and flow will stop after last task.

```js
lightflow()
.then(({ next }) => {
	checkInput(data => next(data));
})
.then(({ next, data }) => {
	console.log(data);
	setTimeout(next, 1000);
})
.loop()
.start()
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