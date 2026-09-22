import { execFileSync } from 'node:child_process';
const messages = execFileSync('git',['log','--format=%B%x00'],{encoding:'utf8'}).split('\0').map(message=>message.trim()).filter(Boolean);
for (const message of messages) {
  if (message.includes('\n') || message !== message.toLowerCase() || ![6,7].includes(message.split(/\s+/).length) || message.includes('co-authored-by')) {
    throw new Error('Invalid commit message: ' + message);
  }
}
console.log('Verified lowercase six or seven word commit subjects.');
