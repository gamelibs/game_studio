import fs from 'node:fs'
import path from 'node:path'

function parseEnv(text) {
  const out = {}
  const lines = String(text || '').split(/\r?\n/)
  for (const line of lines) {
    const s = String(line).trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq <= 0) continue
    const key = s.slice(0, eq).trim()
    let val = s.slice(eq + 1).trim()
    if (!key) continue
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function applyEnv(kv) {
  for (const [k, v] of Object.entries(kv || {})) {
    if (!k) continue
    if (process.env[k] == null || process.env[k] === '') process.env[k] = String(v)
  }
}

function findUp(startDir, filename, maxHops = 6) {
  let dir = path.resolve(startDir)
  for (let i = 0; i < maxHops; i++) {
    const cand = path.join(dir, filename)
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function loadEnv(opts = {}) {
  // Load priority (first match wins per filename):
  // 1) nearest .env.local (upwards)
  // 2) nearest .env (upwards)
  // Search from multiple roots to support launching server via `npm --prefix` from another repo.
  const startDirsIn = Array.isArray(opts.startDirs) ? opts.startDirs : [process.cwd()]
  const startDirs = startDirsIn
    .map((d) => {
      try { return path.resolve(String(d)) } catch { return '' }
    })
    .filter(Boolean)
  const maxHops = Number.isFinite(Number(opts.maxHops)) ? Number(opts.maxHops) : 10

  const pickFirst = (filename) => {
    for (const d of startDirs) {
      const p = findUp(d, filename, maxHops)
      if (p) return p
    }
    return null
  }

  const envLocal = pickFirst('.env.local')
  const env = pickFirst('.env')

  const loaded = []
  for (const p of [envLocal, env]) {
    if (!p) continue
    try {
      const text = fs.readFileSync(p, 'utf-8')
      applyEnv(parseEnv(text))
      loaded.push(p)
    } catch (_) {}
  }
  return { loaded, startDirs }
}
