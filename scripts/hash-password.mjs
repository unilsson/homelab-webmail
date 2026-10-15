import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';

if (!stdin.isTTY) { console.error('Run interactively in a terminal.'); process.exit(1); }
const readline = createInterface({ input: stdin, output: stdout, terminal: true });
stdout.write('Enter a strong local webmail password: ');
stdin.setRawMode(true);
let secret = '';
stdin.on('data', (buf) => {
  const char = buf.toString();
  if (char === '\r' || char === '\n') {
    stdout.write('\n');
    readline.close();
    if (secret.length < 12) { console.error('At least 12 characters required.'); process.exitCode = 1; return; }
    const salt = randomBytes(16);
    console.log('AUTH_PASSWORD_HASH=scrypt$' + salt.toString('hex') + '$' + scryptSync(secret, salt, 64).toString('hex'));
    secret = '';
  } else if (char === '\u0003') { readline.close(); process.exitCode = 130; }
  else if (char === '\u007f') { secret = secret.slice(0, -1); }
  else if (!char.startsWith('\u001b')) { secret += char; }
});
