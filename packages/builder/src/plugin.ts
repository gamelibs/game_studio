export type BuildLogger = {
  info: (msg: string, extra?: any) => void
  warn: (msg: string, extra?: any) => void
  error: (msg: string, extra?: any) => void
}

export type BuildContext = {
  projectId: string
  projectDir: string
  outDir: string
  toolVersion: string
  logger: BuildLogger
}

export type ArtifactManifestV1 = {
  schemaVersion: '1.0'
  gameType: 'story'
  engine: 'pixi'
  entry: 'index.html'
  title: string
  projectId: string
  build: {
    time: string
    toolVersion: string
    pluginId: string
    pluginVersion: string
  }
  files: {
    story: 'story.json'
    assetsDir: 'assets'
  }
}

export type BuilderPlugin = {
  id: string
  version: string
  displayName: string
  gameType: 'story'
  engine: 'pixi'

  /**
   * 从项目目录构建 dist 产物到 outDir
   * - 必须输出：index.html / story.json / game.manifest.json / assets/*
   */
  build: (ctx: BuildContext) => Promise<{ manifest: ArtifactManifestV1 }>
}

