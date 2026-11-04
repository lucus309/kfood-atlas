export async function readApiKey(env) {
  if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY;
  if (!env.OPENAI_KEY_ENVELOPE || !env.OPENAI_KEY_WRAP) return null;
  const raw = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const packet = JSON.parse(env.OPENAI_KEY_ENVELOPE),
    key = await crypto.subtle.importKey('raw', raw(env.OPENAI_KEY_WRAP), 'AES-GCM', false, [
      'decrypt',
    ]);
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw(packet.iv) },
      key,
      raw(packet.ciphertext),
    ),
  );
}
