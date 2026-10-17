/**
 * XORs `bytes` in place with a xorshift128 keystream seeded by four uint32 words. The build encrypts the
 * Jarvis model with this and the page decrypts with it, so both sides share this one implementation.
 * The key ships with the page, so this keeps the model from being a plain download, nothing stronger.
 */
export function xorStream(bytes, seed) {
  let [a, b, c, d] = seed;
  for (let i = 0; i < bytes.length; i += 4) {
    const t = a ^ (a << 11);
    a = b;
    b = c;
    c = d;
    d = (d ^ (d >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    for (let k = 0; k < 4 && i + k < bytes.length; k++) bytes[i + k] ^= (d >>> (k * 8)) & 0xff;
  }
  return bytes;
}
