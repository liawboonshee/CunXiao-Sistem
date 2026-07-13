import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryFiles = [
  'src/voice/VoiceApp.tsx',
  'src/shell/AppShell.tsx',
  'src/inventory/AITools.ts',
]

const paidRuntimePatterns = [
  /askAI\s*\(/,
  /\/api\/chat/,
  /OPENAI_API_KEY/,
  /VITE_API_BASE_URL/,
  /VITE_PROXY_TOKEN/,
]

for (const relativePath of entryFiles) {
  const content = readFileSync(resolve(root, relativePath), 'utf8')
  for (const pattern of paidRuntimePatterns) {
    if (pattern.test(content)) {
      console.error(`[verify-free-build] ${relativePath} 仍包含收费 AI 运行时调用：${pattern}`)
      process.exit(1)
    }
  }
}

function listFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

if (process.argv.includes('--dist')) {
  const distDirectory = resolve(root, 'dist')
  for (const path of listFiles(distDirectory)) {
    const content = readFileSync(path, 'utf8')
    for (const pattern of paidRuntimePatterns) {
      if (pattern.test(content)) {
        console.error(`[verify-free-build] 生产包 ${path} 仍包含收费 AI 调用：${pattern}`)
        process.exit(1)
      }
    }
  }
  console.log('[verify-free-build] OK: 生产包中没有收费 AI 或 Proxy 调用。')
} else {
  console.log('[verify-free-build] OK: APK 入口使用手机语音识别与本地库存解析，无需 AI Key。')
}
