import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TOOL_SPEC } from '../lib/tool-spec.js'

/**
 * Regression coverage for the tool-schema DSL the current DSH compiler
 * (dsh-tools, 0.1.0-rc.6) enforces on the AUTHOR spec at defineTool time:
 *
 * 1. every `type: "object"` node must declare an explicit boolean
 *    `additionalProperties` — otherwise the whole profile boot aborts with
 *    `parameters.<name>.additionalProperties must be explicitly true or false`;
 * 2. the output `schema` root must not carry `required` — the value-schema
 *    DSL only accepts per-property `required: true` and rejects the root key
 *    with `schema.required is not supported by the value schema DSL`.
 *
 * v0.2.0 violated both and could not load at all on rc.6.
 */

function walk(schema, path, onObject) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return
  if (schema.type === 'object') onObject(schema, path)
  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, value] of Object.entries(schema.properties)) walk(value, `${path}.properties.${key}`, onObject)
  }
  if (schema.items) walk(schema.items, `${path}.items`, onObject)
  if (Array.isArray(schema.oneOf)) schema.oneOf.forEach((branch, i) => walk(branch, `${path}.oneOf[${i}]`, onObject))
}

test('object 节点都必须显式声明 additionalProperties（布尔）', () => {
  const bad = []
  for (const [name, value] of Object.entries(TOOL_SPEC.parameters)) walk(value, `parameters.${name}`, (node, path) => {
    if (typeof node.additionalProperties !== 'boolean') bad.push(path)
  })
  walk(TOOL_SPEC.output.schema, 'schema', (node, path) => {
    if (typeof node.additionalProperties !== 'boolean') bad.push(path)
  })
  assert.deepEqual(bad, [], '所有 type:object 节点都需要显式布尔 additionalProperties')
})

test('output schema 根节点不得携带 required', () => {
  assert.ok(!Object.hasOwn(TOOL_SPEC.output.schema, 'required'), 'value-schema DSL 不允许根级 required')
  assert.equal(TOOL_SPEC.output.schema.properties.action.required, true, '属性级 required 仍应保留')
})

test('修复后工具仍可正常执行（行为不回归）', async () => {
  const fmt = await TOOL_SPEC.execute({ action: 'format', value: 123456789, zh: true })
  assert.match(fmt.text, /亿|万/)

  const port = await TOOL_SPEC.execute({
    action: 'portfolio',
    targets: { equity: 60, bond: 40 },
    values: { equity: 60000, bond: 40000 },
  })
  assert.equal(typeof port.text, 'string')
  assert.ok(port.text.length > 0)

  const risk = await TOOL_SPEC.execute({ action: 'risk', returns: [0.01, -0.02, 0.015] })
  assert.match(risk.text, /Sharpe/)
})
