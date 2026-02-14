// Minimal local test for background prompt generation (Seedream-friendly prompt).
// Usage:
//   node apps/server/scripts/test_doubao_prompt.mjs "森林里的一座糖果小屋，夜晚，烛光，温暖治愈"
//
// Env (in .env.local at repo root):
//   STUDIO_BG_PROVIDER=doubao
//   DOUBAO_ARK_API_KEY=...
//   DOUBAO_ARK_TEXT_MODEL=doubao-1-5-pro-32k-250115 (recommended for text)
//   (optional) STUDIO_PROXY_URL=http://127.0.0.1:7890

import { loadEnv } from '../src/env.js'
import { generateBackgroundPrompt } from '../src/ai/imagePrompt.js'

loadEnv({ startDirs: [process.cwd()], maxHops: 2 })

const userInput = String(process.argv.slice(2).join(' ') || '').trim()
if (!userInput) {
  console.error('Missing userInput. Example:')
  console.error('  node apps/server/scripts/test_doubao_prompt.mjs "森林里的一座糖果小屋，夜晚，烛光，温暖治愈"')
  process.exit(1)
}

const startedAt = Date.now()
const { result, meta } = await generateBackgroundPrompt({
  userInput,
  globalPrompt: '',
  globalNegativePrompt: '',
  aspectRatio: '9:16',
  style: 'picture_book'
})

console.log('[ok] provider=', meta?.provider || 'unknown', 'model=', meta?.model || '-', 'ms=', Date.now() - startedAt)
console.log(JSON.stringify(result, null, 2))
