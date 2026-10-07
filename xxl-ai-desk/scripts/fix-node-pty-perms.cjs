/*
 * node-pty 预编译包在部分环境下会丢失 spawn-helper 的可执行权限，
 * 导致终端启动报「posix_spawnp failed」。安装后统一补齐该权限（仅类 Unix 平台）。
 */
const fs = require('fs')
const path = require('path')

/* 递归为 node-pty 目录下的 spawn-helper 补可执行权限 */
function fixExecutable(dir) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      fixExecutable(full)
    } else if (entry.name === 'spawn-helper') {
      try {
        fs.chmodSync(full, 0o755)
      } catch {
        /* 权限设置失败时忽略 */
      }
    }
  }
}

if (process.platform !== 'win32') {
  fixExecutable(path.join(__dirname, '..', 'node_modules', 'node-pty'))
}
