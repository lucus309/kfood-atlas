import fs from 'node:fs';

export function localApiKey({ required = false } = {}) {
  const text = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
  const key =
    process.env.OPENAI_API_KEY || text.match(/^OPENAI_API_KEY\s*=\s*["']?([^\s"']+)/m)?.[1];
  if (required && !key) throw new Error('Set OPENAI_API_KEY in the environment or .env.local.');
  return key;
}
