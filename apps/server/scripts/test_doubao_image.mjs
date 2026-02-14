// Minimal local test for Doubao/Volcengine Ark predict image generation.
// Usage:
//   node apps/server/scripts/test_doubao_image.mjs "绘本风格，狼来了故事，放羊小孩，9:16比例，无文字，色彩柔和"
//
// Env (in .env.local at repo root):
//   STUDIO_BG_PROVIDER=doubao
//   DOUBAO_ARK_API_KEY=...
//   (optional) STUDIO_PROXY_URL=http://127.0.0.1:7890

import { loadEnv } from '../src/env.js'
import { generateBackgroundImage } from '../src/ai/background.js'

loadEnv({ startDirs: [process.cwd()], maxHops: 2 })

const prompt = String(process.argv.slice(2).join(' ') || '').trim()
if (!prompt) {
  console.error('Missing prompt. Example:')
  console.error('  node apps/server/scripts/test_doubao_image.mjs "绘本风格，狼来了故事，放羊小孩，9:16比例，无文字，色彩柔和"')
  process.exit(1)
}

const startedAt = Date.now()
const out = await generateBackgroundImage({
  prompt,
  negativePrompt: '无文字,无水印,非真人',
  aspectRatio: '9:16',
  style: 'picture_book',
  width: 768,
  height: 1344
})

console.log('[ok] provider=', out?.meta?.provider || 'unknown', 'ext=', out?.ext || 'png', 'bytes=', out?.bytes?.length || 0, 'ms=', Date.now() - startedAt)
