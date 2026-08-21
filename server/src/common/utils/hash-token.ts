import crypto from 'node:crypto';

/** `server/src/utils/hashToken.js` ko'chirmasi. Refresh token xeshi. */
export const sha256 = (value: unknown): string =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

export default sha256;
