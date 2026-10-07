import assert from 'node:assert/strict'
import {
  extractTsJsSymbols,
  extractPythonSymbols,
  extractRustSymbols,
  extractGoSymbols,
  extractFileSymbols,
} from '../electron/backend/symbol-outline-extractor.mjs'

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
assert.equal(classSym?.children?.[0].rawName, 'executeTask')

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
`

const rsSymbols = extractRustSymbols(rsCode)
assert.ok(rsSymbols.some((s) => s.kind === 'struct' && s.name === 'TaskManager' && s.exported))
assert.ok(rsSymbols.some((s) => s.kind === 'enum' && s.name === 'Priority' && s.exported))
assert.ok(rsSymbols.some((s) => s.kind === 'trait' && s.name === 'Runnable'))
assert.ok(rsSymbols.some((s) => s.kind === 'function' && s.rawName === 'start_service'))

// ============ 4. Go 测试 ============
const goCode = `
package main

type Config struct {
    Port int
}

type Service interface {
    Start() error
}

func (c *Config) Validate() bool {
    return c.Port > 0
}

func InitializeApp() {
    println("ready")
}
`

const goSymbols = extractGoSymbols(goCode)
assert.ok(goSymbols.some((s) => s.kind === 'struct' && s.name === 'Config' && s.exported))
assert.ok(goSymbols.some((s) => s.kind === 'interface' && s.name === 'Service'))
assert.ok(goSymbols.some((s) => s.kind === 'method' && s.rawName === 'Validate'))
assert.ok(goSymbols.some((s) => s.kind === 'function' && s.rawName === 'InitializeApp'))

// ============ 5. 统一入口测试 ============
const unified = extractFileSymbols('main.go', goCode)
assert.equal(unified.length, goSymbols.length)

console.log('✓ symbol-outline-extractor 所有测试用例 100% 通过！')
