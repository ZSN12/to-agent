import assert from 'node:assert/strict'
import {
  extractTsJsSymbols,
  extractPythonSymbols,
  extractRustSymbols,
  extractGoSymbols,
  extractSwiftSymbols,
  extractFileSymbols,
  supportsFileSymbolOutline,
} from '../backend/symbol-outline-extractor.mjs'

// ============ 1. TypeScript / JavaScript 测试 ============
const tsCode = `
export interface UserConfig {
  apiKey: string;
  timeout?: number;
}

export type ResultType<T> = T | null;

export enum Status {
  Active = 1,
  Inactive = 0
}

export class AgentService {
  constructor() {}
  public async executeTask(taskId: string, force?: boolean): Promise<void> {
    console.log(taskId);
  }
}

export function helperFunction(a: number, b: string) {
  return a + b;
}

export const arrowHandler = (event: any) => {
  return event.data;
};
`

const tsSymbols = extractTsJsSymbols('test.ts', tsCode)
assert.ok(tsSymbols.length >= 5, 'TS 符号数量应至少为 5')

const interfaceSym = tsSymbols.find((s) => s.kind === 'interface')
assert.equal(interfaceSym?.name, 'UserConfig')
assert.equal(interfaceSym?.exported, true)

const classSym = tsSymbols.find((s) => s.kind === 'class')
assert.equal(classSym?.name, 'AgentService')
assert.equal(classSym?.exported, true)
assert.ok(Array.isArray(classSym?.children) && classSym?.children.length >= 1)
assert.ok(classSym?.children?.some((symbol) => symbol.rawName === 'executeTask'))

const funcSym = tsSymbols.find((s) => s.rawName === 'helperFunction')
assert.equal(funcSym?.kind, 'function')
assert.equal(funcSym?.exported, true)

// ============ 2. Python 测试 ============
const pyCode = `
class DataProcessor:
    def __init__(self, name):
        self.name = name

    def process_records(self, records, batch_size=100):
        pass

def global_compute(x, y):
    return x * y
`

const pySymbols = extractPythonSymbols(pyCode)
assert.equal(pySymbols.length, 2, 'Python 应提取 1 个 class 和 1 个顶层函数')
const pyClass = pySymbols.find((s) => s.kind === 'class')
assert.equal(pyClass?.name, 'DataProcessor')
assert.ok(pyClass?.children?.some((c) => c.rawName === 'process_records'))

const pyFunc = pySymbols.find((s) => s.rawName === 'global_compute')
assert.equal(pyFunc?.kind, 'function')

const pyNestedCode = `
class Outer:
    def run(self):
        def nested(value):
            return value
        class LocalHelper:
            def clean(self):
                return None
        return nested

    async def next(self):
        pass

def make_service():
    class Service:
        def start(self):
            pass
    def local_factory():
        return Service
    return local_factory
`

const pyNestedSymbols = extractPythonSymbols(pyNestedCode)
const outerClass = pyNestedSymbols.find((symbol) => symbol.rawName === 'Outer')
assert.deepEqual(
  outerClass?.children?.map((symbol) => [symbol.rawName, symbol.kind]),
  [['run', 'method'], ['next', 'method']],
  'Python class methods should only include definitions directly scoped to the class'
)

const runMethod = outerClass?.children?.find((symbol) => symbol.rawName === 'run')
assert.deepEqual(
  runMethod?.children?.map((symbol) => [symbol.rawName, symbol.kind]),
  [['nested', 'function'], ['LocalHelper', 'class']],
  'Nested functions and classes should remain attached to their lexical parent'
)
assert.equal(
  runMethod?.children?.find((symbol) => symbol.rawName === 'LocalHelper')?.children?.[0].rawName,
  'clean',
  'Methods of nested classes should be retained under that class'
)

const makeService = pyNestedSymbols.find((symbol) => symbol.rawName === 'make_service')
assert.deepEqual(
  makeService?.children?.map((symbol) => [symbol.rawName, symbol.kind]),
  [['Service', 'class'], ['local_factory', 'function']],
  'Nested definitions in top-level functions should not leak into the module outline'
)

const pyTabIndentSymbols = extractPythonSymbols(`class Tabbed:\n\tdef method(self):\n\t\tdef helper():\n\t\t\tpass\n`)
const tabbedClass = pyTabIndentSymbols.find((symbol) => symbol.rawName === 'Tabbed')
assert.equal(
  tabbedClass?.children?.[0].children?.[0].rawName,
  'helper',
  'Nested definitions should be scoped correctly when Python uses tabs'
)
const pyMultilineSymbols = extractPythonSymbols(`
class MultiLineApi:
    async def execute(
        self,
        request: str,
        suffix: str = ")",
    ) -> str:
        return request + suffix
`)
const multilineMethod = pyMultilineSymbols.find((symbol) => symbol.rawName === 'MultiLineApi')
  ?.children?.find((symbol) => symbol.rawName === 'execute')
assert.equal(multilineMethod?.kind, 'method')
assert.match(multilineMethod?.signature ?? '', /suffix: str = "\)"/)

// ============ 3. Rust 测试 ============
const rsCode = `
pub struct TaskManager {
    id: String,
}

pub enum Priority {
    High,
    Low,
}

pub trait Runnable {
    fn run(&self);
}

pub async fn start_service(port: u16) {
    println!("{}", port);
}

impl TaskManager {
    pub async fn execute(
        &self,
        task_id: &str,
    ) -> bool {
        !task_id.is_empty()
    }
}
`

const rsSymbols = extractRustSymbols(rsCode)
assert.ok(rsSymbols.some((s) => s.kind === 'struct' && s.name === 'TaskManager' && s.exported))
assert.ok(rsSymbols.some((s) => s.kind === 'enum' && s.name === 'Priority' && s.exported))
assert.ok(rsSymbols.some((s) => s.kind === 'trait' && s.name === 'Runnable'))
assert.ok(rsSymbols.some((s) => s.kind === 'function' && s.rawName === 'start_service'))
assert.ok(rsSymbols.some((s) => s.kind === 'method' && s.rawName === 'execute' && s.line > 1))

// ============ 4. Go 测试 ============
const goCode = `
package main

type Config struct {
    Port int
}

type Service interface {
    Start() error
}

type Store[T any] struct {
    value T
}

func (c *Config) Validate() bool {
    return c.Port > 0
}

func (s *Store[T]) Get(
    key string,
) (T, bool) {
    value, ok := s.values[key]
    return value, ok
}

func InitializeApp(
) {
    println("ready")
}
`

const goSymbols = extractGoSymbols(goCode)
assert.ok(goSymbols.some((s) => s.kind === 'struct' && s.name === 'Config' && s.exported))
assert.ok(goSymbols.some((s) => s.kind === 'interface' && s.name === 'Service'))
assert.ok(goSymbols.some((s) => s.kind === 'struct' && s.name === 'Store'))
assert.ok(goSymbols.some((s) => s.kind === 'method' && s.rawName === 'Validate'))
assert.ok(goSymbols.some((s) => s.kind === 'method' && s.rawName === 'Get'))
assert.ok(goSymbols.some((s) => s.kind === 'function' && s.rawName === 'InitializeApp'))

// ============ 5. 统一入口测试 ============
const unified = extractFileSymbols('main.go', goCode)
assert.equal(unified.length, goSymbols.length)

// TypeScript's Node-specific module extensions use the same AST parser.
assert.ok(extractFileSymbols('src/entry.mts', 'export function startModule() {}')
  .some((symbol) => symbol.rawName === 'startModule'))
assert.ok(extractFileSymbols('src/entry.cts', 'export const startCommonJs = () => true')
  .some((symbol) => symbol.rawName === 'startCommonJs'))

const memberSymbols = extractFileSymbols('src/agent.ts', `
export interface AgentContract {
  readonly state: string
  execute(input: string): Promise<void>
}

export class Agent implements AgentContract {
  constructor(private readonly id: string) {}
  get state(): string { return this.id }
  set state(value: string) { void value }
  execute(input: string): Promise<void> { return Promise.resolve() }
  executeLater = (delay: number) => delay
}
`)
const contract = memberSymbols.find((symbol) => symbol.rawName === 'AgentContract')
assert.ok(contract?.children?.some((symbol) => symbol.rawName === 'state' && symbol.kind === 'property'))
assert.ok(contract?.children?.some((symbol) => symbol.rawName === 'execute' && symbol.kind === 'method'))
const agent = memberSymbols.find((symbol) => symbol.rawName === 'Agent')
assert.deepEqual(
  agent?.children?.map((symbol) => symbol.rawName),
  ['constructor', 'state', 'state', 'execute', 'executeLater'],
  'class outline should include constructors, accessors, methods, and function-valued fields',
)
assert.equal(supportsFileSymbolOutline('src/entry.mts'), true)
assert.equal(supportsFileSymbolOutline('Sources/App.swift'), true)

const swiftSymbols = extractSwiftSymbols(`
// func fakeFromComment() {}
let documentation = """
class FakeFromString {
  func fakeFromStringBody() {}
}
"""

public protocol RuntimeServing {
  func prepare(configuration: RuntimeConfiguration) async throws
  var isReady: Bool { get }
}

@MainActor
public final class RuntimeController: RuntimeServing {
  private let service: RuntimeService

  public init(service: RuntimeService) {
    self.service = service
  }

  public func prepare(
    configuration: RuntimeConfiguration
  ) async throws -> Bool {
    return true
  }

  private var runtimeStatus: String {
    return "func fakeFromComputedString() {}"
  }

  func runTask() {
    func localOnly() {}
  }
}

extension RuntimeController {
  func reset() {}
}

public func createRuntime() -> RuntimeController { RuntimeController(service: RuntimeService()) }
`)
const runtimeContract = swiftSymbols.find((symbol) => symbol.rawName === 'RuntimeServing')
assert.equal(runtimeContract?.kind, 'interface')
assert.deepEqual(runtimeContract?.children?.map((symbol) => symbol.rawName), ['prepare', 'isReady'])
const runtimeController = swiftSymbols.find((symbol) => symbol.rawName === 'RuntimeController')
assert.equal(runtimeController?.kind, 'class')
assert.ok(runtimeController?.children?.some((symbol) => symbol.rawName === 'init' && symbol.kind === 'method'))
assert.ok(runtimeController?.children?.some((symbol) => symbol.rawName === 'prepare' && /configuration: RuntimeConfiguration/.test(symbol.signature)))
assert.ok(runtimeController?.children?.some((symbol) => symbol.rawName === 'runtimeStatus' && symbol.kind === 'property'))
assert.ok(runtimeController?.children?.some((symbol) => symbol.rawName === 'runTask'))
assert.ok(!runtimeController?.children?.some((symbol) => symbol.rawName === 'localOnly'), 'nested local functions are not type members')
const extension = swiftSymbols.find((symbol) => symbol.rawName === 'RuntimeController' && symbol.name.startsWith('extension '))
assert.ok(extension?.children?.some((symbol) => symbol.rawName === 'reset'))
assert.ok(swiftSymbols.some((symbol) => symbol.rawName === 'createRuntime' && symbol.kind === 'function'))
assert.ok(!swiftSymbols.some((symbol) => /fakeFrom/.test(symbol.rawName)), 'comments and regular multiline strings do not create Swift symbols')
const unifiedSwift = extractFileSymbols('Sources/RuntimeController.swift', 'struct RuntimeController { func prepare() {} }')
assert.ok(unifiedSwift.some((symbol) => symbol.rawName === 'RuntimeController'))

console.log('✓ symbol-outline-extractor 所有测试用例 100% 通过！')
