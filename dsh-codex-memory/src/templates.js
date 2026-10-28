import { readFileSync } from 'node:fs'

const load = (name) => readFileSync(new URL(`./templates/${name}`, import.meta.url), 'utf8')

export const TEMPLATES = Object.freeze({
  adHocInstructions: load('ad_hoc_instructions.md'),
  consolidation: load('consolidation.md'),
  consolidationV2: load('consolidation_v2.md'),
  readPath: load('read_path.md'),
  readPathV2: load('read_path_v2.md'),
  stageOneInput: load('stage_one_input.md'),
  stageOneInputV2: load('stage_one_input_v2.md'),
  stageOneSystem: load('stage_one_system.md'),
  stageOneSystemV2: load('stage_one_system_v2.md'),
})

export function renderTemplate(source, values) {
  return source.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!Object.hasOwn(values, key)) return match
    return String(values[key] ?? '')
  })
}
