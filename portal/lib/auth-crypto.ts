const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function hashPassword(password: string, existingSalt?: string) {
  const saltBytes = existingSalt ? fromBase64Url(existingSalt) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 120_000, hash: 'SHA-256' }, key, 256);
  return { hash: toBase64Url(new Uint8Array(bits)), salt: toBase64Url(saltBytes) };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = await hashPassword(password, salt);
  const actual = fromBase64Url(hash);
  const expected = fromBase64Url(expectedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

export async function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwt<T>(token: string, secret: string): Promise<T | null> {
  const [header, body, signature] = token.split('.');
  if (!header || !body || !signature) return null;
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(signature), encoder.encode(`${header}.${body}`));
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as T;
  } catch {
    return null;
  }
}
