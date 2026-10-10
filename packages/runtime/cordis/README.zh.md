# cordis 包族

<a id="family-cordis"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

维护运行时使用的 Cordis 框架及其基础库源代码。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/cordis`](#pkg-taskweaver-cordis) | `cordis/cordis` | [接口与限制](#pkg-taskweaver-cordis) |
| [`@taskweaver/cosmokit`](#pkg-taskweaver-cosmokit) | `cordis/cosmokit` | [接口与限制](#pkg-taskweaver-cosmokit) |
| [`@taskweaver/cordis-plugin-group`](#pkg-taskweaver-cordis-plugin-group) | `cordis/group` | [接口与限制](#pkg-taskweaver-cordis-plugin-group) |
| [`@taskweaver/cordis-plugin-hmr`](#pkg-taskweaver-cordis-plugin-hmr) | `cordis/hmr` | [接口与限制](#pkg-taskweaver-cordis-plugin-hmr) |
| [`@taskweaver/cordis-plugin-include`](#pkg-taskweaver-cordis-plugin-include) | `cordis/include` | [接口与限制](#pkg-taskweaver-cordis-plugin-include) |
| [`@taskweaver/cordis-plugin-loader`](#pkg-taskweaver-cordis-plugin-loader) | `cordis/loader` | [接口与限制](#pkg-taskweaver-cordis-plugin-loader) |
| [`@taskweaver/schemastery`](#pkg-taskweaver-schemastery) | `cordis/schemastery` | [接口与限制](#pkg-taskweaver-schemastery) |
| [`@taskweaver/cordis-plugin-timer`](#pkg-taskweaver-cordis-plugin-timer) | `cordis/timer` | [接口与限制](#pkg-taskweaver-cordis-plugin-timer) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-cordis"></a>
### `@taskweaver/cordis`

<!-- migrated-from: packages/runtime/cordis/cordis/README.md -->
目录：`cordis/cordis`。
package.json 描述：Meta-Framework for Modern JavaScript Applications

<a id="pkg-taskweaver-cordis--cordis"></a>
Cordis is a TypeScript plugin framework for applications that need explicit
dependency injection, scoped services, lifecycle-managed cleanup, and optional
configuration-driven loading. The core package is published as `cordis`; the
official packages in this repository add a loader, config-file includes, HMR,
console logging, timers, and project scaffolding.

<a id="pkg-taskweaver-cordis--install"></a>
#### Install

```sh
yarn add cordis
```

Cordis is ESM-first. The repository is tested on current Node releases, and the
scaffolder requires Node 22 or newer.

<a id="pkg-taskweaver-cordis--quick-start"></a>
#### Quick Start

```ts
import { Context, Service } from 'cordis'

declare module 'cordis' {
  interface Context {
    counter: Counter
  }

  interface Events {
    'app/ready'(message: string): void
  }
}

class Counter extends Service {
  value = 0

  constructor(ctx: Context) {
    super(ctx, 'counter')
  }

  next() {
    return ++this.value
  }
}

const greeter = Object.assign((ctx: Context) => {
  ctx.on('app/ready', (message) => {
    ctx.logger.info('%s #%d', message, ctx.counter.next())
  })
}, {
  inject: ['counter'],
})

const root = new Context()
await root.plugin(Counter)
await root.plugin(greeter)

root.emit('app/ready', 'started')
await root.fiber.dispose()
```

The important pieces are:

- `new Context()` creates the root dependency container.
- `ctx.plugin()` starts a plugin and returns a `Fiber`.
- `inject` tells Cordis which services must exist before the plugin runs.
- Effects, event listeners, and services are removed when their owning fiber is
  disposed.

<a id="pkg-taskweaver-cordis--documentation"></a>
#### Documentation

- [Tutorial: build a plugin]（原文链接目标：`../../docs/tutorials/build-a-plugin.md`）
- [Guide: plugin lifecycle]（原文链接目标：`../../docs/guides/plugin-lifecycle.md`）
- [Guide: loader configuration]（原文链接目标：`../../docs/guides/loader-config.md`）
- [API reference]（原文链接目标：`../../docs/api/core.md`）

<a id="pkg-taskweaver-cordis--packages"></a>
#### Packages

| Package | Purpose |
| --- | --- |
| `cordis` | Core context, plugin registry, fiber lifecycle, events, services, and logger. |
| `create-cordis` | Interactive project scaffolder. |
| `@cordisjs/plugin-loader` | Runtime plugin tree and loader service. |
| `@cordisjs/plugin-include` | YAML/JSON config-file include support for the loader. |
| `@cordisjs/plugin-group` | Nested plugin groups for loader configs. |
| `@cordisjs/plugin-hmr` | Hot module replacement for loader-managed plugins. |
| `@cordisjs/plugin-logger-console` | Console exporter for the built-in logger. |
| `@cordisjs/plugin-timer` | Disposal-aware timeout, interval, throttle, and debounce helpers. |
| `@cordisjs/utils` | Shared utilities used by Cordis packages. |

<a id="pkg-taskweaver-cordis--development"></a>
#### Development

```sh
yarn install
yarn build
yarn test
yarn lint
```

The monorepo uses Yakumo to build and test all packages. Most examples in the
docs use public APIs from `cordis`; loader examples additionally use
`@cordisjs/plugin-loader` and `@cordisjs/plugin-include`.

<a id="pkg-taskweaver-cosmokit"></a>
### `@taskweaver/cosmokit`

<!-- migrated-from: packages/runtime/cordis/cosmokit/README.md -->
目录：`cordis/cosmokit`。
package.json 描述：A collection of common utilities

<a id="pkg-taskweaver-cosmokit--cosmokit"></a>
[![Codecov](https://img.shields.io/codecov/c/github/shigma/cosmokit?style=flat-square)](https://codecov.io/gh/shigma/cosmokit)
[![npm](https://img.shields.io/npm/v/cosmokit?style=flat-square)](https://www.npmjs.com/package/cosmokit)

A collection of common utilities.

<a id="pkg-taskweaver-cosmokit--usage"></a>
#### Usage

<a id="pkg-taskweaver-cosmokit--node-js"></a>
##### Node.js

```sh
npm install cosmokit
```

```ts
import cosmokit from 'cosmokit'
``` 

<a id="pkg-taskweaver-cosmokit--deno"></a>
##### Deno

```ts
import cosmokit from 'npm:cosmokit@latest'
```

<a id="pkg-taskweaver-cordis-plugin-group"></a>
### `@taskweaver/cordis-plugin-group`

<!-- migrated-from: packages/runtime/cordis/group/README.md -->
目录：`cordis/group`。
package.json 描述：Nested plugin group for cordis

<a id="pkg-taskweaver-cordis-plugin-group--cordisjs-plugin-group"></a>
Loader group plugin for nesting Cordis entries.

<a id="pkg-taskweaver-cordis-plugin-group--usage"></a>
#### Usage

```yaml
- id: tools
  name: '@cordisjs/plugin-group'
  group: true
  config:
    - id: logger
      name: '@cordisjs/plugin-logger-console'
```

Groups are always considered enabled themselves, but disabling a group entry
prevents its child entries from running. Nested entry ids use `:` separators,
for example `tools:logger`.

The package re-exports the `Group` implementation from
`@cordisjs/plugin-loader` as its default plugin.

<a id="pkg-taskweaver-cordis-plugin-hmr"></a>
### `@taskweaver/cordis-plugin-hmr`

<!-- migrated-from: packages/runtime/cordis/hmr/README.md -->
目录：`cordis/hmr`。
package.json 描述：Hot Module Replacement Plugin for Cordis

<a id="pkg-taskweaver-cordis-plugin-hmr--cordisjs-plugin-hmr"></a>
Hot module replacement for loader-managed Cordis plugins.

The HMR plugin watches source files, traces Node's module graph, clears affected
module caches, and reloads only the plugin entries that depend on changed
application files. Changes to framework-level dependencies fall back to
`loader.exit()`, letting the host process restart.

Module watches canonicalize their existing base directory before opening
Chokidar. Exact config watches likewise canonicalize the deepest existing
ancestor, then restore any missing suffix. Callbacks and diagnostics retain the
requested absolute filename, while the native backend receives one filesystem
spelling even when Windows supplied an 8.3 alias.

<a id="pkg-taskweaver-cordis-plugin-hmr--requirements"></a>
#### Requirements

- `@cordisjs/plugin-loader`
- `@cordisjs/plugin-timer`
- A runtime that exposes Node's internal module loader. The package throws if
  the loader service has no internal module loader available.

<a id="pkg-taskweaver-cordis-plugin-hmr--usage"></a>
#### Usage

```yaml
- id: timer
  name: '@cordisjs/plugin-timer'
- id: hmr
  name: '@cordisjs/plugin-hmr'
  config:
    root:
      - src
    ignored:
      - '**/node_modules'
      - '**/.*'
    debounce: 100
```

<a id="pkg-taskweaver-cordis-plugin-hmr--config"></a>
#### Config

| Field | Description |
| --- | --- |
| `base` | Optional base directory resolved from `ctx.baseUrl`. |
| `root` | Chokidar roots to watch. Defaults to `['.']`. |
| `ignored` | Picomatch patterns excluded from watch and reload analysis. |
| `debounce` | Milliseconds to wait before processing a burst of changes. |

<a id="pkg-taskweaver-cordis-plugin-hmr--events"></a>
#### Events

| Event | Description |
| --- | --- |
| `hmr/change` | Emitted for changed files that are not handled by plugin reload or config reload. |
| `hmr/reload` | Emitted after one or more plugin entries are reloaded. |

<a id="pkg-taskweaver-cordis-plugin-include"></a>
### `@taskweaver/cordis-plugin-include`

<!-- migrated-from: packages/runtime/cordis/include/README.md -->
目录：`cordis/include`。
package.json 描述：Include files in cordis configurations

<a id="pkg-taskweaver-cordis-plugin-include--cordisjs-plugin-include"></a>
File-backed loader tree for Cordis. The include plugin reads a YAML or JSON
file, turns it into loader entries, and writes updates back when the file is
writable.

<a id="pkg-taskweaver-cordis-plugin-include--usage"></a>
#### Usage

```ts
import { Context } from 'cordis'
import Loader from '@cordisjs/plugin-loader'
import Include from '@cordisjs/plugin-include'

const root = new Context()
await root.plugin(Loader, { baseUrl: import.meta.url })
await root.plugin(Include, {
  path: './cordis.yml',
  initial: [],
  enableLogs: true,
})
```

Example `cordis.yml`:

```yaml
- id: timer
  name: '@cordisjs/plugin-timer'
- id: app
  name: ./plugins/app
  config:
    message: hello
```

<a id="pkg-taskweaver-cordis-plugin-include--config"></a>
#### Config

| Field | Description |
| --- | --- |
| `path` | YAML or JSON file path resolved from `ctx.baseUrl`. |
| `initial` | Entry list written when the file is missing. |
| `patches` | Runtime patches applied after reading the file. |
| `enableLogs` | Enables loader apply, reload, and unload logs. |

Patches can insert entries or override fields on entries with a matching `id`.

<a id="pkg-taskweaver-cordis-plugin-loader"></a>
### `@taskweaver/cordis-plugin-loader`

<!-- migrated-from: packages/runtime/cordis/loader/README.md -->
目录：`cordis/loader`。
package.json 描述：Plugin loader for cordis

<a id="pkg-taskweaver-cordis-plugin-loader--cordisjs-plugin-loader"></a>
Runtime plugin loader for Cordis. The loader owns an `EntryTree`, imports plugin
modules by name, applies their config, and keeps the running plugin graph in
sync with entry updates.

<a id="pkg-taskweaver-cordis-plugin-loader--usage"></a>
#### Usage

```ts
import { Context } from 'cordis'
import Loader from '@cordisjs/plugin-loader'

const root = new Context()
await root.plugin(Loader, { baseUrl: import.meta.url })

const id = await root.loader.create({
  name: './plugins/example',
  config: { enabled: true },
})

await root.loader.await()
root.loader.update(id, { config: { enabled: false } })
```

<a id="pkg-taskweaver-cordis-plugin-loader--entry-options"></a>
#### Entry Options

| Field | Description |
| --- | --- |
| `id` | Stable id for resolving, updating, and removing the entry. |
| `name` | Module specifier imported by the loader. |
| `config` | Config passed to the plugin. |
| `group` | Marks the entry as a group whose `config` is a child entry list. |
| `disabled` | Stops the entry and prevents it from starting. |
| `inject` | Adds required services or intercept config for this entry. |

<a id="pkg-taskweaver-cordis-plugin-loader--api"></a>
#### API

| API | Description |
| --- | --- |
| `loader.create(options, parent?, position?)` | Add and start an entry. |
| `loader.update(id, options, parent?, position?)` | Update, move, and restart an entry. |
| `loader.remove(id)` | Stop and delete an entry. |
| `loader.resolve(id)` | Resolve an entry by id, including nested `a:b` ids. |
| `loader.resolveGroup(id)` | Resolve the root group or a nested group. |
| `loader.await()` | Wait for pending entry imports and fiber reloads. |
| `loader.locate(fiber?)` | Return the loader entry id that owns a fiber. |

For file-backed trees, use `@cordisjs/plugin-include`.

<a id="pkg-taskweaver-schemastery"></a>
### `@taskweaver/schemastery`

<!-- migrated-from: packages/runtime/cordis/schemastery/README.md -->
目录：`cordis/schemastery`。
package.json 描述：Type driven schema validator

<a id="pkg-taskweaver-schemastery--schemastery"></a>
[![Codecov](https://img.shields.io/codecov/c/github/shigma/schemastery?style=flat-square)](https://codecov.io/gh/shigma/schemastery)
[![downloads](https://img.shields.io/npm/dm/schemastery?style=flat-square)](https://www.npmjs.com/package/schemastery)
[![npm](https://img.shields.io/npm/v/schemastery?style=flat-square)](https://www.npmjs.com/package/schemastery)
[![GitHub](https://img.shields.io/github/license/shigma/schemastery?style=flat-square)](https://github.com/shigma/schemastery/blob/master/LICENSE)

Type Driven Schema Validator.

<a id="pkg-taskweaver-schemastery--features"></a>
#### Features

- **Lightweight.** Much smaller than other validation libraries.
- **Easy to use.** You can use any schema as a function or constructor directly.
- **Powerful.** Schemastery supports some advanced types such as `union`, `intersect` and `transform`.
- **Extensible.** You can create your own schema types via `Schema.extend()`.
- **Serializable.** Schema objects can be serialized into JSON and then be hydrated in another environment.

<a id="pkg-taskweaver-schemastery--basic-examples"></a>
#### Basic Examples

<a id="pkg-taskweaver-schemastery--use-as-validator-javascript"></a>
##### use as validator (JavaScript)

```js
const Schema = require('schemastery')

const validate = Schema.number().default(10)

validate(0)     // 0
validate(null)  // 10
validate('')    // TypeError
```

<a id="pkg-taskweaver-schemastery--use-as-constructor-typescript"></a>
##### use as constructor (TypeScript)

```ts
import Schema from 'schemastery'

interface Config {
  foo: Record<string, string>
  bar: string[]
}

const Config = Schema.object({
  foo: Schema.dict(Schema.string()).default({}),
  bar: Schema.array(Schema.string()).default([]),
})

// config is an instance of Config
// in this case, that is { foo: {}, bar: [] }
const config = new Config()
```

<a id="pkg-taskweaver-schemastery--general-types"></a>
#### General Types

<a id="pkg-taskweaver-schemastery--schema-any"></a>
##### Schema.any()

Assert that the value is of any type.

```js
const validate = Schema.any()

validate()            // undefined
validate(0)           // 0
validate({})          // {}
```

<a id="pkg-taskweaver-schemastery--schema-never"></a>
##### Schema.never()

Assert that the value is nullable.

```js
const validate = Schema.never()

validate()            // undefined
validate(0)           // TypeError
validate({})          // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-const-value"></a>
##### Schema.const(value)

Assert that the value is equal to the given constant.

```js
const validate = Schema.const(10)

validate(10)          // 10
validate(0)           // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-number"></a>
##### Schema.number()

Assert that the value is a number.

```js
const validate = Schema.number()

validate()            // undefined
validate(1)           // 1
validate('')          // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-string"></a>
##### Schema.string()

Assert that the value is a string.

```js
const validate = Schema.string()

validate()            // undefined
validate(0)           // TypeError
validate('foo')       // 'foo'
```

<a id="pkg-taskweaver-schemastery--schema-boolean"></a>
##### Schema.boolean()

Assert that the value is a boolean.

```js
const validate = Schema.boolean()

validate()            // undefined
validate(0)           // TypeError
validate(true)        // true
```

<a id="pkg-taskweaver-schemastery--schema-is-constructor"></a>
##### Schema.is(constructor)

Assert that the value is an instance of the given constructor.

```js
const validate = Schema.is(RegExp)

validate()            // undefined
validate(/foo/)       // /foo/
validate('foo')       // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-array-inner"></a>
##### Schema.array(inner)

Assert that the value is an array of `inner`. The default value will be `[]` if not specified.

```js
const validate = Schema.array(Schema.number())

validate()                  // []
validate(0)                 // TypeError
validate([0, 1])            // [0, 1]
validate([0, '1'])          // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-dict-inner"></a>
##### Schema.dict(inner)

Assert that the value is a dictionary of `inner`. The default value will be `{}` if not specified.

```js
const validate = Schema.dict(Schema.number())

validate()                  // {}
validate(0)                 // TypeError
validate({ a: 0, b: 1 })    // { a: 0, b: 1 }
validate({ a: 0, b: '1' })  // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-tuple-list"></a>
##### Schema.tuple(list)

Assert that the value is a tuple whose each element is of corresponding subtype. The default value will be `[]` if not specified.

```js
const validate = Schema.tuple([
  Schema.number(),
  Schema.string(),
])

validate()                  // []
validate([0])               // { a: 0 }
validate([0, 1])            // TypeError
validate([0, '1'])          // [0, '1']
```

<a id="pkg-taskweaver-schemastery--schema-object-dict"></a>
##### Schema.object(dict)

Assert that the value is an object whose each property is of corresponding subtype. The default value will be `{}` if not specified.

```js
const validate = Schema.object({
  a: Schema.number(),
  b: Schema.string(),
})

validate()                  // {}
validate({ a: 0 })          // { a: 0 }
validate({ a: 0, b: 1 })    // TypeError
validate({ a: 0, b: '1' })  // { a: 0, b: '1' }
```

<a id="pkg-taskweaver-schemastery--schema-union-list"></a>
##### Schema.union(list)

Assert that the value is one of the specified types.

```js
const validate = Schema.union([
  Schema.number(),
  Schema.string(),
])

validate()                  // undefined
validate(0)                 // 0
validate('1')               // '1'
validate(true)              // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-intersect-list"></a>
##### Schema.intersect(list)

Assert that the value should match each specified type.

```js
const validate = Schema.intersect([
  Schema.object({ a: Schema.string().required() }),
  Schema.object({ b: Schema.number().default(0) }),
])

validate()                  // TypeError
validate({ a: '' })         // { a: '', b: 0 }
validate({ a: '', b: 1 })   // { a: '', b: 1 }
validate({ a: '', b: '2' }) // TypeError
```

<a id="pkg-taskweaver-schemastery--schema-transform-inner-callback"></a>
##### Schema.transform(inner, callback)

Assert that the value is of the specified subtype and then transformed by `callback`.

```js
const validate = Schema.transform(Schema.number().default(0), n => n + 1)

validate()                  // 1
validate('0')               // TypeError
validate(10)                // 11
```

<a id="pkg-taskweaver-schemastery--instance-methods"></a>
#### Instance Methods

Note: `default` and `required` are mutually exclusive.

<a id="pkg-taskweaver-schemastery--schema-required"></a>
##### schema.required()

Assert that the value is not nullable.

<a id="pkg-taskweaver-schemastery--schema-default-value"></a>
##### schema.default(value)

Set the fallback value when nullable.

<a id="pkg-taskweaver-schemastery--schema-description-text"></a>
##### schema.description(text)

Set the description of the schema.

<a id="pkg-taskweaver-schemastery--schema-simplify-value"></a>
##### schema.simplify(value)

Normalize a value by removing parts that are equal to schema defaults. This is
useful when storing user configuration and keeping persisted files compact.

```js
const Config = Schema.object({
  foo: Schema.string().default(''),
  bar: Schema.number().default(0),
})

Config.simplify({ foo: '', bar: 1 }) // { bar: 1 }
```

<a id="pkg-taskweaver-schemastery--validation-options"></a>
#### Validation Options

All schemas are callable. The second argument accepts validation options:

```js
const Config = Schema.object({
  foo: Schema.number(),
})

Config({ foo: '1' }, { autofix: true }) // {}
```

- `autofix`: remove invalid object properties where possible.
- `ignore`: skip validation for selected values and schema nodes.
- `path`: provide an initial path for nested validation errors.

<a id="pkg-taskweaver-schemastery--shorthand-syntax"></a>
#### Shorthand Syntax

Some shorthand syntax is available for inner types.

- `undefined` -> `Schema.any()`
- `String` -> `Schema.string()`
- `Number` -> `Schema.number()`
- `Boolean` -> `Schema.boolean()`
- `1` -> `Schema.const(1)` (only for primitive types)
- `Date` -> `Schema.is(Date)`

```js
Schema.array(String)        // Schema.array(Schema.string())
Schema.dict(RegExp)         // Schema.dict(Schema.is(RegExp))
Schema.union([1, 2])        // Schema.union([Schema.const(1), Schema.const(2)])
```

You can also use `Schema.from()` to get the inferred schema from a shorthand value.

```js
Schema.from()               // Schema.any()
Schema.from(Date)           // Schema.is(Date)
Schema.from('foo')          // Schema.const('foo')
```

<a id="pkg-taskweaver-schemastery--advanced-examples"></a>
#### Advanced Examples

Here are some examples which demonstrate how to define advanced types.

<a id="pkg-taskweaver-schemastery--enumeration"></a>
##### Enumeration

```js
const Enum = Schema.union(['red', 'blue'])

Enum('red')                 // 'red'
Enum('blue')                // 'blue'
Enum('green')               // TypeError
```

<a id="pkg-taskweaver-schemastery--tostring"></a>
##### ToString

```js
const ToString = Schema.transform(Schema.any(), v => String(v))

ToString('')                // ''
ToString(0)                 // '0'
ToString({})                // '{}'
```

<a id="pkg-taskweaver-schemastery--listable"></a>
##### Listable

```js
const Listable = Schema.union([
  Schema.array(Number),
  Schema.transform(Number, n => [n]),
]).default([])

Listable()                  // []
Listable(0)                 // [0]
Listable([1, 2])            // [1, 2]
```

<a id="pkg-taskweaver-schemastery--alias"></a>
##### Alias

```js
const Config = Schema.dict(Number, Schema.union([
  'foo',
  Schema.transform('bar', () => 'foo'),
]))

Config({ foo: 1 })          // { foo: 1 }
Config({ bar: 2 })          // { foo: 2 }
Config({ bar: '3' })        // TypeError
```

<a id="pkg-taskweaver-schemastery--extensibility"></a>
#### Extensibility

Custom schema types are registered with `Schema.extend(type, resolve)`. A
resolver receives the input value, schema node, validation options, and a strict
flag. Return `[value]` for accepted input, or `[value, adapted]` when the caller
should write an adapted value back to the source object.

```js
Schema.extend('trimmed', (data, schema, options) => {
  if (typeof data !== 'string') {
    throw new Schema.ValidationError(`expected string but got ${data}`, options)
  }
  return [data.trim()]
})
```

<a id="pkg-taskweaver-schemastery--serializability"></a>
#### Serializability

```js
const schema1 = Schema.object({
  foo: Schema.string(),
  bar: Schema.number(),
})

// should have the same effect as schema1
const schema2 = new Schema(JSON.parse(JSON.stringify(schema1)))
```

Schemastery also exposes the Standard Schema `~standard` property, so compatible
tools can validate values without depending on Schemastery-specific APIs.

<a id="pkg-taskweaver-cordis-plugin-timer"></a>
### `@taskweaver/cordis-plugin-timer`

<!-- migrated-from: packages/runtime/cordis/timer/README.md -->
目录：`cordis/timer`。
package.json 描述：Timer service for cordis

<a id="pkg-taskweaver-cordis-plugin-timer--cordisjs-plugin-timer"></a>
Disposal-aware timer service for Cordis.

<a id="pkg-taskweaver-cordis-plugin-timer--usage"></a>
#### Usage

```ts
import { Context } from 'cordis'
import Timer from '@cordisjs/plugin-timer'

const root = new Context()
await root.plugin(Timer)

const dispose = root.timeout(() => {
  root.logger.info('done')
}, 1000)

dispose()
```

Timer handles are registered on the current fiber, so they are cleared
automatically when the plugin that created them is disposed.

<a id="pkg-taskweaver-cordis-plugin-timer--api"></a>
#### API

| API | Description |
| --- | --- |
| `ctx.timeout(callback, delay)` | Run once and return a disposer. |
| `ctx.timeout(delay)` | Return a promise that resolves after `delay`. |
| `ctx.interval(callback, delay)` | Run repeatedly and return a disposer. |
| `ctx.interval(delay)` | Return an async iterator that yields on each interval. |
| `ctx.throttle(callback, delay, noTrailing?)` | Return a throttled function with `.dispose()`. |
| `ctx.debounce(callback, delay)` | Return a debounced function with `.dispose()`. |

`ctx.setTimeout()` and `ctx.setInterval()` are kept as deprecated aliases for
`ctx.timeout()` and `ctx.interval()`.

<a id="family-cordis"></a>
### 原族级说明（迁移保留）

<a id="family-cordis--vendored-packages"></a>
This directory contains source-vendored copies of the Cordis framework and its foundation libraries. They are copied into this monorepo instead of being depended on via npm, so that the harness fully owns its framework layer (auditable, patchable, pinned).

All vendored packages are **renamed into the `@deepseek-ai` scope** (`cordis` → `@taskweaver/cordis`, `@cordisjs/plugin-<x>` → `@taskweaver/cordis-plugin-<x>`): every harness package declares `cordis` as a peer dependency, so publishing the harness publishes this framework layer too, and a publication under the upstream names would squat them on the registry. Directory names and upstream version numbers are deliberately unchanged, so the manifest below still reads as an upstream snapshot. `pnpm-workspace.yaml#linkWorkspacePackages` makes those preserved semver ranges resolve these pinned workspaces, including imports from built `lib/`. The `hygiene` gate `verify-vendored-links` asserts every vendored name resolves to a workspace `link:` in `pnpm-lock.yaml` with no registry copy alongside. Schemastery's manifest additionally declares a conditional `exports` map (import → `.mjs`, require → `.cjs`): pnpm links the directory itself, so without `exports` Node's ESM resolver would fall back to `main` and load the CJS entry whose lazy `require('@taskweaver/cosmokit')` can race ESM loading of the same linked module under module-hook hosts (vitest). Upstream MIT `LICENSE` files are preserved in each package directory.

This file covers the manifest, the local-modification log, and the procedure for **updating** an existing vendored package. To **add a new** one, see the cookbook guide: [docs/cookbook/adding-a-vendored-package.md]（原文链接目标：`../docs/cookbook/adding-a-vendored-package.md`）.

<a id="family-cordis--manifest"></a>
#### Manifest

Upstream workspace: `cordis-workspace` (local checkout: `~/repos/cordis-workspace`).

| Directory | npm name | Upstream name | Version | Upstream repo | Commit |
|---|---|---|---|---|---|
| `cosmokit/` | `@taskweaver/cosmokit` | `cosmokit` | 1.8.1 | https://github.com/deepseek-harness/cosmokit | `16f6fc058ade66e8ac5da0033d35a8d0f279f544` |
| `schemastery/` | `@taskweaver/schemastery` | `schemastery` | 3.18.0 | https://github.com/deepseek-harness/schemastery (`packages/core`) | `e67cee00ad725bd1534aee930a979ea3eec6f698` |
| `cordis/` | `@taskweaver/cordis` | `cordis` | 4.0.0-rc.7 | https://github.com/cordiverse/cordis (`packages/core`) | `56b3d4f725681cf4556c1a8695a709cc3b6eed74` |
| `loader/` | `@taskweaver/cordis-plugin-loader` | `@cordisjs/plugin-loader` | 1.0.0-rc.5 | https://github.com/cordiverse/cordis (`packages/loader`) | `56b3d4f725681cf4556c1a8695a709cc3b6eed74` |
| `include/` | `@taskweaver/cordis-plugin-include` | `@cordisjs/plugin-include` | 1.0.4 | https://github.com/deepseek-harness/cordis (`packages/include`) | `abb0a307cb1d3b0947f455d590cf5ba922d4caa4` |
| `group/` | `@taskweaver/cordis-plugin-group` | `@cordisjs/plugin-group` | 1.0.0 | https://github.com/deepseek-harness/cordis (`packages/group`) | `abb0a307cb1d3b0947f455d590cf5ba922d4caa4` |
| `timer/` | `@taskweaver/cordis-plugin-timer` | `@cordisjs/plugin-timer` | 1.1.2 | https://github.com/deepseek-harness/cordis (`packages/timer`) | `abb0a307cb1d3b0947f455d590cf5ba922d4caa4` |
| `hmr/` | `@taskweaver/cordis-plugin-hmr` | `@cordisjs/plugin-hmr` | 1.0.15 | https://github.com/deepseek-harness/cordis (`packages/hmr`) | `abb0a307cb1d3b0947f455d590cf5ba922d4caa4` |
| `logger-console/` | `@taskweaver/cordis-plugin-logger-console` | `@cordisjs/plugin-logger-console` | 1.0.0 | https://github.com/deepseek-harness/cordis (`packages/logger-console`) | `abb0a307cb1d3b0947f455d590cf5ba922d4caa4` |

Third-party dependencies of the vendored packages stay on npm: `@standard-schema/spec`, `js-yaml`, `chokidar`, `picomatch`, `@babel/code-frame`, `supports-color`, `node-addon-require-builtin`.

Intentionally **not** vendored (verified unused by this set): `reggol`, `@cordisjs/utils`, `@cordisjs/element`, `@cordisjs/unyaml` (dev-time YAML import hook only).

<a id="family-cordis--local-modifications"></a>
#### Local modifications

Keep this log exhaustive — every divergence from upstream must be listed.

1. **`hmr/src/index.ts`**: removed the `./locales/en-US.yml` / `./locales/zh-CN.yml` imports, the `.i18n({...})` call on the `Config` schema, and the `src/locales/` directory. Rationale: those imports require a runtime YAML loader hook (`@cordisjs/unyaml`) that we do not vendor; the i18n texts only localize config descriptions.
2. **All `package.json` files**: regenerated — added `private: true`, added precise `files` entries for bundled runtime files and `lib/types/**/*.d.ts` / `.d.ts.map`, preserved `src` in `files` only for packages whose previous file list already shipped it, added a `./src/*` export where missing, pointed declaration metadata at `lib/types`, and removed upstream `devDependencies`/`scripts`/`repository` fields. Dependency and peer-dependency ranges are preserved except that `hmr` declares `esbuild` as a direct dev dependency because its source imports the `BuildFailure` type and pnpm's strict workspace resolution requires the owner package to name that dependency, and `loader` requires `node-addon-require-builtin@^0.1.4` to match the runtime used by published app packages.
3. **All `tsconfig.json` files**: regenerated to extend the repo-root `tsconfig.base.json`, emit TypeScript intermediates to `lib/types`, and declare project references.
4. **Vendored TypeScript source internal specifiers**: changed local relative imports/exports from upstream's specifier shape to explicit `.ts` specifiers so TypeScript rewrites emitted JS to `.js` while declarations keep explicit, NodeNext-safe `.ts` specifiers. This includes `loader/src/config/isolate.ts` using `declare module './entry.ts'`.
5. **`schemastery/tsdown.config.ts` and `logger-console/tsdown.config.ts`**: ours, not upstream files — per-package build-shape overrides (dual ESM+CJS output; separate node/browser entries) for the repo-root tsdown build. They read the JS emitted under `lib/types` and then write the publish runtime entries under `lib/`. Like the regenerated tsconfigs, they are not part of the upstream sync surface.
6. **`cordis/src/fiber.ts` lifecycle hardening**: locally closes three reentrant disposal gaps. An effect's owner-list wrapper is registered before its setup body runs, so an unload begun from inside setup awaits setup and every collected cleanup; synchronous setup failure removes the wrapper and rolls back collected cleanup. Async cleanup stays owner-visible until quiescence, and Cordis's internal effect composition joins an already-running cleanup while repeated public disposer calls retain their upstream single-shot result. Effect creation is rejected while the owner is `UNLOADING` (while `PENDING` and `LOADING` remain legal), preventing cleanup-time registrations from escaping the unload snapshot. Child fibers register and receive their parent-owned disposer before `internal/plugin` publication, resolve dependency declarations added by that notification before activation, drain effects attached while pending, skip plugin execution when reentrant disposal invalidates the load epoch before its first checkpoint, and contain teardown-notification failures per observer so one callback cannot starve peers or interrupt ownership cleanup. `Fiber.update()` returns its `internal/update` waterfall result, allowing Loader callers to await a restart while preserving synchronous config validation.
7. **`cordis/src/*.ts` JSDoc enrichment**: added `@param`/`@returns` tags and contract documentation (disposal semantics, waterfall veto, bail conditions, error cases) across the public plugin-author surface — `Context` (class, statics, and the `Context` interface properties incl. `root`), `EventsService`, `Fiber`, `RegistryService`, `ReflectService`, `Service`, `LoggerService` and their `declare module './context.ts'` overloads. Comment-only; no code changes. Motivation: the website API-reference generator renders these docs and hard-errors on undocumented members. Retire this entry when the enrichment is upstreamed to the fork.
8. **Transactional Loader/Include config reconciliation**: Loader imports a changed entry name before disposal, awaits lifecycle settlement, and restores the previous plugin or config when candidate application fails. Loader settlement rechecks service-gated fibers after current tasks drain, rejects failures, and leaves fibers with absent dependencies pending. Group updates start candidates concurrently, await every outcome, contain sibling-start failures after their owning tree is disposed, undo changes and additions on live-update failure, await removal, preserve programmatic option identity, and persist direct or tree-level mutations only after success. Include reads and validates detached candidate content, applies patches to a clone, reconciles the tree, and only then commits its cached content/data; direct refresh failures propagate for the caller to contain. A non-array parse is invalid, patches re-apply on every file or Include-config update, an omitted patch list clears the overlay, and initial content falls back to `initial` only on `ENOENT`. Covered by `packages/boot/app-boot/tests/config-reload.spec.ts` and `packages/host/webserver/tests/webserver.spec.ts`.
9. **`hmr/src/index.ts` exact config watching**: `registerConfig()` watches one absolute config path outside module roots, including a path under missing parents, serializes and coalesces refreshes, and returns an async disposer that closes the watcher and drains active work. Module watches realpath their existing base directory, attach change listeners before declaring the service ready, and use that spelling for Node module-cache identity; exact config watches realpath the deepest existing watch ancestor and restore the missing suffix. Those native paths prevent Windows short-name aliases from colliding with long-form libuv event paths while exact-config callbacks keep the requested filename. Refresh failures are normalized to `Error`, logged, and broadcast through the parallel `hmr/config-update-failed` event; observer failures are contained. Config-file changes discovered by the ordinary HMR watcher use the same serialized path. Covered by `packages/boot/app-boot/tests/hmr-config.spec.ts`.
10. **Vendored Node-compatible TypeScript**: marked erased imports explicitly across `cordis`, `loader`, `include`, `hmr`, and `schemastery` so Node's native TypeScript transform does not request types as runtime exports. Schemastery's source uses an ESM default export and its package declares `type: module`; its built ESM/CJS entries retain explicit `.mjs`/`.cjs` extensions.
11. **`include/src/index.ts` patch-semantics export**: extracted the private `applyPatches` body into the exported pure function `applyEntryPatches(data, patches, warn)` (the method delegates to it) and exported the `!!js` YAML dialect as `entryListSchema`, so `dsh --dump-config` composes and prints exactly what the include would mount without booting a tree. Behavior-preserving for mounting; the extraction exists because config tooling must never reimplement (and drift from) the patch algorithm. `applyEntryPatches` also indexes each `insert`ed entry as it is added, so a later patch in the same list can configure or disable a row an earlier patch inserted; upstream built the id index once before the patch loop, leaving inserted rows silently unpatchable. That matters because `dsh` composes an empty profile root with each bundle's patch layer, the profile's and the home-level `cordis.patch.yml`, and any `--patch` overlays as sibling patch lists at one include level — patches never cross an include boundary, so surface-only rows would otherwise be unreachable from user config. Covered by `packages/boot/app-boot/tests/config-reload.spec.ts`.
12. **`include/src/index.ts` serialized child-tree mutation and `hmr/src/index.ts` main-watcher initial-scan suppression**: every Include child-tree mutation (initial apply, refresh, `internal/update` patch re-application) runs through one per-Include queue, because the group's transactional `update` is not reentrant — two concurrent applies interleave create and rollback on the same entries and strand the Include fiber without ever settling. The HMR main watcher passes `ignoreInitial: true`: the initial scan re-announced files boot had just consumed, and its `add` for a config file refreshed an Include mid-initial-apply; once serialized, a failing initial apply's rollback disposed HMR, whose teardown drain waited on the queued refresh sitting behind that same apply — a deadlock that exited 13 with no diagnostic. `registerConfig()` keeps its own `ignoreInitial: false` watcher because a user patch layer present at registration must apply once. Covered by the patch-overlay boot-failure built-bin case in `host-cli/tests/built-bin.e2e.ts`.
13. **`include/src/index.ts` `writeTask` type**: widened the optional `writeTask?: NodeJS.Timeout` property to `NodeJS.Timeout | undefined` — the debounced writer assigns `undefined` on flush, which `exactOptionalPropertyTypes` rejects on a plain optional. Type-only; no behavior change.
14. **`include/src/index.ts` durable debounced writes**: serialized and tracked config-file writes, retried transient `EACCES`/`EBUSY`/`EPERM` rename failures with a bounded backoff, observed asynchronous timer rejections, and drained the latest write during Include teardown. Windows can briefly retain a destination handle after a Loader child disposes; the upstream fire-and-forget rename escaped as an unhandled rejection and could lose the persisted `disabled` state. A terminal failure is logged by the asynchronous writer and remains on the queue so `Include.stop()` rethrows it instead of silently declaring persistence complete; Cordis's ordinary fiber teardown retains its separate error-containment contract. Covered by `packages/host/directory-picker-auto/tests/loader-composition.spec.ts` with injected transient and terminal rename failures.
15. **Lazy Loader config resolution across `cordis/src/{events,fiber}.ts`, `loader/src/{index,config/entry}.ts`, `include/src/index.ts`, and `hmr/src/index.ts`**: ports [cordiverse/cordis#41](https://github.com/cordiverse/cordis/pull/41), retaining raw fiber config and resolving it through `internal/config` only after declared injections are active. Provider replacement re-resolves the raw expression, pending updates retain it, and HMR transfers it. Resolution applies only to the entry root, so child plugins mounted by a row keep caller-owned config identity. Include declares the `EntryGroup.key` tree-carrier marker (as Group does): its config is entry and patch lists, so interpolation keeps it literal and a `!!js` expression inside a nested row's config resolves lazily in that row's own fiber (Include's own `path` therefore stays literal too). Deferred failures retain the owning row diagnostic, and tree teardown does not persist failure-driven self-disposal. Covered by `packages/boot/app-boot/tests/{app-boot,user-patches}.spec.ts`, `packages/boot/cmdline/tests/cmdline.spec.ts`, `host-cli/tests/web-agent-presets.e2e.ts`, and the built custom-profile cases in `host-cli/tests/built-bin.e2e.ts`.
16. **`cordis/package.json` publishes `src`**: added `src` to the `files` list, joining the other eight vendored packages. Cordis declares `"./src/*": "./src/*"` in its exports, so a tarball without `src` publishes an export map pointing at absent files; the release change judgement also reads `files` to decide whether a diff reaches the payload, and a package whose only published paths are build output has no tracked path to match.
17. **`@deepseek-ai` rescope**: every vendored manifest `name`, every internal dependency entry among the vendored set, and every module specifier that reaches them use the scoped names in the manifest table's `npm name` column. Directory names, version numbers, and dependency ranges are unchanged, and no upstream runtime identifier is renamed — `Symbol.for('schemastery')` and Schemastery's `vendor:` metadata field keep their upstream values. Re-apply with `pnpm run rescope-vendor --apply` after a sync; the table's two name columns are the mapping, restated for consumers in [docs/rescope.md]（原文链接目标：`../docs/rescope.md`）.
18. **Entry `disabled` interpolation in `loader/src/config/entry.ts`**: a `disabled: !!js` expression evaluates against the loader context at every mount decision; the raw node stays in the options, so write-back keeps the `!!js` form. `disabled` is the only interpolated metadata field. Covered by `packages/boot/app-boot/tests/user-patches.spec.ts` and `host-cli/tests/windows-shell.spec.ts`.

<a id="family-cordis--sync-procedure"></a>
#### Sync procedure

To update a vendored package from upstream:

1. In the upstream workspace, note `git rev-parse HEAD` of the relevant submodule.
2. Copy the package's `src/` (and `bin.js`, `README.md`, `LICENSE` if changed) over the vendored directory.
3. Re-apply the local modifications listed above (or drop them if upstream made them unnecessary — update the log either way).
4. Update the version and commit hash in the manifest table.
5. Run `pnpm install && pnpm run test && pnpm run build` at the repo root.
