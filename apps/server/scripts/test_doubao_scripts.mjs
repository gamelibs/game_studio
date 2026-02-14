// Minimal local test for scripts (story cards) generation via Doubao.
// Usage:
//   STUDIO_AI_PROVIDER=doubao node apps/server/scripts/test_doubao_scripts.mjs "一个在月球垃圾场捡到会说话的机器人"
//
// Env (in .env.local at repo root):
//   STUDIO_AI_PROVIDER=doubao
//   DOUBAO_ARK_API_KEY=...
//   DOUBAO_ARK_TEXT_MODEL=doubao-1-5-pro-32k-250115 (recommended for text)
//   (optional) STUDIO_PROXY_URL=http://127.0.0.1:7890

import { loadEnv } from '../src/env.js'
import { generateScriptDraft } from '../src/ai/scripts.js'

loadEnv({ startDirs: [process.cwd()], maxHops: 2 })

const prompt = String(process.argv.slice(2).join(' ') || '').trim()
if (!prompt) {
  console.error('Missing prompt. Example:')
  console.error('  STUDIO_AI_PROVIDER=doubao node apps/server/scripts/test_doubao_scripts.mjs "一个在月球垃圾场捡到会说话的机器人"')
  process.exit(1)
}

process.env.STUDIO_AI_PROVIDER = process.env.STUDIO_AI_PROVIDER || 'doubao'

const startedAt = Date.now()
const gen = await generateScriptDraft({
  prompt,
  title: '',
  rules: null,
  formula: { schemaVersion: '1.0', format: 'numeric', choicePoints: 2, optionsPerChoice: 2, endings: 2 }
})

console.log('[ok] provider=', gen?.meta?.provider || 'unknown', 'model=', gen?.meta?.model || '-', 'ms=', Date.now() - startedAt)
console.log(JSON.stringify(gen?.draft || null, null, 2))
