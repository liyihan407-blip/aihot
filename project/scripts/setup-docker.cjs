// 创建独立的本地 Docker 配置，保留已经存在的配置和数据库密码。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const templatePath = path.join(root, '.env.docker.example');
const configPath = path.join(root, '.env.docker.local');

if (fs.existsSync(configPath)) {
  console.log('本地 Docker 配置已存在，已保留原有配置。');
  process.exit(0);
}

const password = () => crypto.randomBytes(24).toString('hex');
const content = fs.readFileSync(templatePath, 'utf8')
  .replace('DB_PASSWORD=请设置数据库密码', 'DB_PASSWORD=' + password());
try {
  fs.writeFileSync(configPath, content, { encoding: 'utf8', flag: 'wx' });
  console.log('已生成 .env.docker.local 和独立的本地 MySQL 密码。');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log('本地 Docker 配置已存在，已保留原有配置。');
  } else {
    throw error;
  }
}
