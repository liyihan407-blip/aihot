const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const env = {...process.env};
let java;
try {java=require('./java-runtime.cjs').resolveJava21()} catch(e){console.error(e.message);process.exit(1)}
if(java.home)env.JAVA_HOME=java.home;
const args = process.argv.slice(2);
// 后端 Maven 工程放在 backend；允许调用方用 -f 指定其他测试配置。
if (!args.some(arg => arg === '-f' || arg === '--file' || arg.startsWith('--file='))) {
  args.unshift('-f', path.join(root, 'backend', 'pom.xml'));
}
const pathKey = Object.keys(env).find(k=>k.toLowerCase()==='path') || 'PATH';
// 优先 JAVA_HOME，避免误选 Windows PATH 中的旧 Java。参数直接传给 Java，不拼 shell 命令。
if (env.JAVA_HOME) env[pathKey] = path.join(env.JAVA_HOME, 'bin') + path.delimiter + (env[pathKey] || '');
let executable = 'mvn', launchArgs = args;
if (process.platform === 'win32') {
  const candidates = (env[pathKey] || '').split(path.delimiter).map(p=>path.join(p.replace(/^"|"$/g,''),'mvn.cmd'));
  const mvnPath = candidates.find(p=>fs.existsSync(p));
  const mavenHome = env.MAVEN_HOME || env.M2_HOME || (mvnPath && path.dirname(path.dirname(mvnPath)));
  const boot = mavenHome && path.join(mavenHome,'boot');
  const jar = boot && fs.existsSync(boot) && fs.readdirSync(boot).find(n=>/^plexus-classworlds-.*\.jar$/.test(n));
  if (!jar) {console.error('未找到标准 Maven 安装。请设置 MAVEN_HOME，并将 Maven 的 bin 目录加入 PATH。');process.exit(1)}
  executable = java.exe;
  launchArgs = ['-Dfile.encoding=UTF-8','-Dclassworlds.conf='+path.join(mavenHome,'bin','m2.conf'),
    '-Dmaven.home='+mavenHome,'-Dmaven.multiModuleProjectDirectory='+root,
    '-classpath',path.join(boot,jar),'org.codehaus.plexus.classworlds.launcher.Launcher',...args];
}
const child = spawn(executable,launchArgs,{cwd:root,stdio:'inherit',env,windowsHide:true});
child.on('error',e=>{console.error('启动失败：请检查 JDK 21、JAVA_HOME 和 Maven。'+e.message);process.exit(1)});
child.on('exit',code=>process.exit(code ?? 1));
