function pickProxyUrl() {
  const raw =
    String(process.env.STUDIO_PROXY_URL || '').trim() ||
    String(process.env.HTTPS_PROXY || '').trim() ||
    String(process.env.HTTP_PROXY || '').trim() ||
    String(process.env.ALL_PROXY || '').trim()
  return raw
}

function classify(url) {
  const s = String(url || '').trim()
  if (!s) return { kind: 'none' }
  if (/^socks/i.test(s)) return { kind: 'socks' }
  if (/^https?:\/\//i.test(s)) return { kind: 'http' }
  return { kind: 'unsupported', reason: 'invalid_proxy_url' }
}

export function getProxyInfo() {
  const proxyUrl = pickProxyUrl()
  const cls = classify(proxyUrl)
  return {
    proxyUrl: proxyUrl ? proxyUrl.replace(/\/\/([^:]+):[^@]+@/, '//***:***@') : '',
    kind: cls.kind,
    reason: cls.reason || null
  }
}

export function getProxyUrl() {
  return pickProxyUrl()
}
