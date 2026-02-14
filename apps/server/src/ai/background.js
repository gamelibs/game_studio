import { spawn } from 'node:child_process'
import { getProxyUrl } from '../net/proxy.js'
import { generateImageViaDoubaoArkImages } from './doubao.js'

/*
  apps/server/src/ai/background.js

// 根据 content-type 猜测文件扩展名（默认 png）。用于从下载响应中选择合适的后缀。


  说明：该模块负责根据不同后端提供者（例如 sdwebui 或 doubao）生成背景图像，
  并包含若干辅助函数用于发起 HTTP 请求（通过 curl 子进程）、下载二进制数据、
  以及对输入参数（尺寸、步数等）做边界裁剪与默认值选择。

  主要导出函数：
  - `generateBackgroundImage(input)`：入口，根据 `input.provider` 选择不同实现返回图片 bytes。

  错误处理：
  - 大量使用抛出 Error 并设置 `status` 字段来为上层路由提供 HTTP 语义化状态码。
*/

function clampInt(n, min, max, fallback) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

// 选择默认图片提供者：优先使用环境变量 `STUDIO_BG_PROVIDER`，否则默认为 `sdwebui`。
function pickProvider() {
  return String(process.env.STUDIO_BG_PROVIDER || 'sdwebui').toLowerCase()
}

// 使用本地 `curl` 发起 HTTP 请求并解析 JSON 响应。
// 特性：支持自定义 headers/body、超时、代理，并将 HTTP 状态解析为返回结果或 Error。
// 注意：依赖系统安装 curl。返回一个 Promise，解析为 JSON 对象或抛出带 `.status` 的 Error。
function curlRequestJson({ url, method, headers, body, timeoutMs, proxyUrl }) {
  const marker = '__CURL_STATUS__'
  const args = [
    '-sS',
    '-X',
    String(method || 'POST').toUpperCase(),
    '--max-time',
    String(Math.max(1, Math.ceil((Number(timeoutMs || 0) || 20000) / 1000))),
    ...(proxyUrl ? ['--proxy', String(proxyUrl)] : []),
    '-w',
    `\\n${marker}:%{http_code}\\n`,
    ...Object.entries(headers || {}).flatMap(([k, v]) => ['-H', `${k}: ${v}`])
  ]
  if (body != null) args.push('--data-binary', '@-')
  args.push(String(url))

  return new Promise((resolve, reject) => {
    const p = spawn('curl', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    const chunks = []
    const errChunks = []

    const killTimer = setTimeout(() => {
      try { p.kill('SIGKILL') } catch (_) {}
    }, Math.max(1000, Number(timeoutMs || 0) || 20000) + 1000)

    p.stdout.on('data', (d) => chunks.push(d))
    p.stderr.on('data', (d) => errChunks.push(d))
    p.on('error', (e) => {
      clearTimeout(killTimer)
      reject(e)
    })
    p.on('close', (code) => {
      clearTimeout(killTimer)
      const out = Buffer.concat(chunks).toString('utf-8')
      const errText = Buffer.concat(errChunks).toString('utf-8')
      const idx = out.lastIndexOf(`${marker}:`)
      const statusStr = idx >= 0 ? out.slice(idx + marker.length + 1).trim().split(/\s+/)[0] : ''
      const status = statusStr ? Number(statusStr) : NaN
      const jsonText = idx >= 0 ? out.slice(0, idx).trim() : out.trim()

      if (!Number.isFinite(status)) {
        const e = new Error(`curl_no_status${errText ? `: ${errText.trim()}` : ''}`)
        e.code = code
        reject(e)
        return
      }
      if (status === 0) {
        const e = new Error(errText && errText.trim() ? `curl_transport_error: ${errText.trim()}` : 'curl_transport_error')
        e.status = 0
        e.code = code
        reject(e)
        return
      }
      let json = null
      try {
        json = jsonText ? JSON.parse(jsonText) : null
      } catch (e) {
        const err = new Error('invalid_json_response')
        err.status = status
        err.body = jsonText
        reject(err)
        return
      }
      if (status < 200 || status >= 300) {
        const msg =
          json && typeof json === 'object'
            ? (json.error && (json.error.message || json.error)) || json.message || JSON.stringify(json)
            : `HTTP ${status}`
        const e = new Error(String(msg))
        e.status = status
        e.body = json
        reject(e)
        return
      }
      resolve(json)
    })

    if (body != null) {
      try {
        p.stdin.write(typeof body === 'string' ? body : JSON.stringify(body))
      } catch (_) {}
    }
    try { p.stdin.end() } catch (_) {}
  })
}

function curlDownload({ url, timeoutMs, proxyUrl }) {
  // -D - dumps headers to stdout; we split on last header block.
  const args = [
    '-sS',
    '-L',
    '--max-time',
    String(Math.max(1, Math.ceil((Number(timeoutMs || 0) || 20000) / 1000))),
    ...(proxyUrl ? ['--proxy', String(proxyUrl)] : []),
    '-D',
    '-',
    String(url)
  ]
  return new Promise((resolve, reject) => {
    const p = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []
    const errChunks = []
    const killTimer = setTimeout(() => {
      try { p.kill('SIGKILL') } catch (_) {}
    }, Math.max(1000, Number(timeoutMs || 0) || 20000) + 1000)
    p.stdout.on('data', (d) => chunks.push(d))
    p.stderr.on('data', (d) => errChunks.push(d))
    p.on('error', (e) => {
      clearTimeout(killTimer)
      reject(e)
    })
    p.on('close', (code) => {
      clearTimeout(killTimer)
      if (code !== 0) {
        const errText = Buffer.concat(errChunks).toString('utf-8').trim()
        const e = new Error(errText ? `curl_download_failed: ${errText}` : 'curl_download_failed')
        e.code = code
        reject(e)
        return
      }
      const buf = Buffer.concat(chunks)
      // There may be multiple header blocks (redirects). Find the last \r\n\r\n boundary before body.
      const marker = Buffer.from('\r\n\r\n')
      let headerEnd = -1
      for (let i = 0; i < buf.length - marker.length; i++) {
        if (buf.slice(i, i + marker.length).equals(marker)) headerEnd = i + marker.length
      }
      if (headerEnd < 0) {
        resolve({ contentType: '', bytes: buf })
        return
      }
      const headerText = buf.slice(0, headerEnd).toString('utf-8')
      const bodyBytes = buf.slice(headerEnd)
      const m = headerText.match(/content-type:\\s*([^\\r\\n]+)/i)
      resolve({ contentType: m ? String(m[1]).trim() : '', bytes: bodyBytes })
    })
  })
}

function extFromContentType(ct) {
  const s = String(ct || '').toLowerCase()
  if (s.includes('image/png')) return 'png'
  if (s.includes('image/webp')) return 'webp'
  if (s.includes('image/jpeg') || s.includes('image/jpg')) return 'jpg'
  if (s.includes('image/gif')) return 'gif'
  return 'png'
}

// 入口函数：根据 `input.provider` 分发到不同的实现。
// 返回对象：{ bytes: Buffer, ext: 'png'|'jpg'|'webp', meta: { provider: 'doubao'|'sdwebui', ... } }
export async function generateBackgroundImage(input) {
  const provider = String(input && input.provider ? input.provider : pickProvider()).toLowerCase()
  if (provider === 'doubao') return generateBackgroundViaDoubao(input)
  if (provider === 'sdwebui') return generateBackgroundViaSdWebui(input)
  const e = new Error(`unsupported_provider:${provider}`)
  e.status = 501
  throw e
}

// 使用 SD-WebUI 的 txt2img 接口生成图片：
// - 构造 payload，调用 /sdapi/v1/txt2img
// - 解析返回的 base64 图像数据并返回 Buffer
// - 在任何网络或解析错误时抛出带 `.status = 502` 的 Error
async function generateBackgroundViaSdWebui(input) {
  const baseUrl = String(input && input.sdwebuiBaseUrl ? input.sdwebuiBaseUrl : (process.env.SDWEBUI_BASE_URL || 'http://127.0.0.1:7860')).replace(/\/+$/, '')
  const payload = {
    prompt: String(input.prompt || '').trim(),
    negative_prompt: String(input.negativePrompt || '').trim() || undefined,
    width: clampInt(input.width, 64, 2048, 768),
    height: clampInt(input.height, 64, 2048, 1024),
    steps: clampInt(input.steps, 5, 50, 20),
    cfg_scale: (() => {
      const n = Number(input.cfgScale)
      return Number.isFinite(n) ? Math.max(1, Math.min(15, n)) : 7
    })(),
    sampler_name: String(input.sampler || 'Euler a')
  }

  let json = null
  try {
    const resp = await fetch(`${baseUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    json = await resp.json().catch(() => null)
    if (!resp.ok || !json || !Array.isArray(json.images) || !json.images[0]) {
      const msg = json && (json.error || json.detail || json.message) ? String(json.error || json.detail || json.message) : `HTTP ${resp.status}`
      const e = new Error(msg)
      e.status = 502
      throw e
    }
  } catch (e) {
    const err = new Error(e && e.message ? e.message : String(e))
    err.status = 502
    throw err
  }

  const b64 = String(json.images[0]).split(',').pop()
  return { bytes: Buffer.from(b64, 'base64'), ext: 'png', meta: { provider: 'sdwebui' } }
}

async function generateBackgroundViaDoubao(input) {
  // Doubao (Volcengine Ark Images) 实现：
  // - 尝试通过封装的 `generateImageViaDoubaoArkImages` 获取结果（可能直接返回 bytes 或给出 url）
  // - 如果返回 url，则使用 curlDownload 拉取二进制并根据 content-type 推断扩展名
  // - 对于网络/响应错误，抛出带 status=502 的 Error
  const proxyUrl = String(input && input.proxyUrl ? input.proxyUrl : '').trim() || getProxyUrl()
  const timeoutMs = clampInt(input && input.timeoutMs != null ? input.timeoutMs : process.env.STUDIO_BG_TIMEOUT_MS, 5_000, 120_000, 60_000)

  const prompt = String(input.prompt || '').trim()
  const negativePrompt = String(input.negativePrompt || '').trim()
  const width = clampInt(input.width, 64, 2048, 768)
  const height = clampInt(input.height, 64, 2048, 1024)

  const aspectRatio = String(input.aspectRatio || '').trim() || guessAspectRatio({ width, height })
  const style = String(input.style || '').trim() || String(process.env.DOUBAO_STYLE || '').trim() || 'picture_book'
  const watermark = String(process.env.DOUBAO_WATERMARK || 'false').toLowerCase() === 'true' ? true : false

  // New API doesn't support style/aspectRatio fields directly; we pass them implicitly via prompt+size.
  const res = await generateImageViaDoubaoArkImages({
    prompt,
    negativePrompt,
    aspectRatio,
    style,
    watermark,
    proxyUrl,
    timeoutMs,
    width,
    height,
    cfgScale: input.cfgScale,
    guidanceScale: input.guidanceScale,
    size: input.size,
    model: input.model,
    apiUrl: input.apiUrl,
    responseFormat: input.responseFormat || 'url',
    sequentialImageGeneration: input.sequentialImageGeneration || 'disabled'
  })

  if (res.bytes) {
    return { bytes: res.bytes, ext: res.ext || 'jpg', meta: { provider: 'doubao', api: 'ark', mode: res.mode || 'binary' } }
  }

  if (!res.url) {
    const e = new Error('doubao_invalid_response: missing image url')
    e.status = 502
    throw e
  }

  const dl = await curlDownload({ url: res.url, timeoutMs, proxyUrl })
  return { bytes: dl.bytes, ext: extFromContentType(dl.contentType), meta: { provider: 'doubao', api: 'ark', url: res.url } }
}

// 根据宽高猜测最接近的纵横比预设（用于当未显式提供 aspectRatio 时）
function guessAspectRatio({ width, height }) {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return '9:16'
  const r = w / h
  const presets = [
    { k: '1:1', r: 1 },
    { k: '4:3', r: 4 / 3 },
    { k: '3:4', r: 3 / 4 },
    { k: '3:2', r: 3 / 2 },
    { k: '2:3', r: 2 / 3 },
    { k: '16:9', r: 16 / 9 },
    { k: '9:16', r: 9 / 16 },
    { k: '9:1', r: 9 }
  ]
  let best = presets[0]
  let bestDist = Infinity
  for (const p of presets) {
    const d = Math.abs(r - p.r)
    if (d < bestDist) {
      best = p
      bestDist = d
    }
  }
  return best.k
}
