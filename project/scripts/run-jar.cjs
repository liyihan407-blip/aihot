const {spawn} = require('node:child_process');
const path = require('node:path');
const {resolveJava21} = require('./java-runtime.cjs');
try {
  const java = resolveJava21();
  const root = path.resolve(__dirname,'../..');
  const child = spawn(java.exe,['-Xms128m','-Xmx512m','-jar',path.join(root,'backend','target','aihot-1.0.0.jar')],{cwd:root,stdio:'inherit',windowsHide:true});
  child.on('error',e=>{console.error(e.message);process.exit(1)});
  child.on('exit',code=>process.exit(code ?? 1));
} catch(e) {console.error(e.message);process.exit(1)}
