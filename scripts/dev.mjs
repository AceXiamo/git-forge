import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const manager = packageManagerCommand()
const children = new Set()

const initial = runScript('build:webview', { block: true })
if (initial.status !== 0)
  process.exit(initial.status ?? 1)

startScript('dev:extension')
startScript('dev:webview')

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    stopChildren(signal)
    process.exit(0)
  })
}

function packageManagerCommand() {
  const execPath = process.env.npm_execpath
  if (execPath) {
    return {
      command: process.execPath,
      args: [execPath],
    }
  }

  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: [],
  }
}

function runScript(script, options = {}) {
  const args = [...manager.args, 'run', '-s', script]
  if (options.block) {
    return spawnSync(manager.command, args, {
      stdio: 'inherit',
      shell: false,
    })
  }

  return spawn(manager.command, args, {
    stdio: 'inherit',
    shell: false,
  })
}

function startScript(script) {
  const child = runScript(script)
  children.add(child)
  child.on('exit', (code, signal) => {
    children.delete(child)
    if (signal || code === 0)
      return

    stopChildren('SIGTERM')
    process.exit(code ?? 1)
  })
}

function stopChildren(signal) {
  for (const child of children)
    child.kill(signal)
}
