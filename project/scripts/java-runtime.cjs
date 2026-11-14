const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

function resolveJava21() {
  const win = process.platform === 'win32';
  const binary = win ? 'java.exe' : 'java';
  const candidates = [];
  if (process.env.JAVA_HOME) candidates.push({home:process.env.JAVA_HOME, exe:path.join(process.env.JAVA_HOME,'bin',binary)});
  const jdks = path.join(os.homedir(),'.jdks');
  if (fs.existsSync(jdks)) for (const name of fs.readdirSync(jdks)) {
    if (/(?:^|[-_])(21|22|23|24|25|26)(?:[.-]|$)/.test(name)) {
      const home = path.join(jdks,name); candidates.push({home,exe:path.join(home,'bin',binary)});
    }
  }
  candidates.push({home:null,exe:binary});
  for (const candidate of candidates) {
    const result = spawnSync(candidate.exe,['-version'],{encoding:'utf8',windowsHide:true,timeout:5000});
    const text = (result.stdout || '')+' '+(result.stderr || '');
    const match = text.match(/version\s+"(\d+)(?:\.(\d+))?/);
    const major = match ? (match[1]==='1' ? Number(match[2]) : Number(match[1])) : 0;
    if (!result.error && result.status===0 && major>=21) return candidate;
  }
  throw new Error('未找到 JDK 21 或更新版本，请将 JAVA_HOME 设置为 JDK 21 的安装目录。见 project/docs/配置与启动指南.md。');
}
module.exports = {resolveJava21};
