/**
 * トークン暗号化ユーティリティ（HKDF + AES-GCM）。
 *
 * 背景: マルチアカウント認証で、refresh_token を D1 に安全に保存するための
 * 二重暗号化を実装する。
 *
 * 暗号化階層:
 *   KEK = HKDF(SERVER_SECRET, google_sub) — ユーザー固有のキー暗号化キー
 *   DEK = ランダム生成 — データ暗号化キー（KEKで暗号化してDBに保存）
 *   refresh_token — DEKで暗号化してDBに保存
 *
 * DB漏洩だけでは復号不可（SERVER_SECRET が必要）。
 * SERVER_SECRET 漏洩だけでも復号不可（google_sub が必要）。
 */

/** AES-GCM の暗号化結果。IV と暗号文を base64 で保持する */
export interface EncryptedData {
  ciphertext: string; // base64
  iv: string; // base64
}

/**
 * HKDF で KEK（Key Encryption Key）を導出する。
 *
 * SERVER_SECRET と google_sub の両方がないと同じキーを再現できない。
 * google_sub は Google ID Token から取得する不変のユーザー識別子。
 */
export async function deriveKEK(
  serverSecret: string,
  googleSub: string,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // SERVER_SECRET を HKDF の入力キーマテリアルとしてインポート
  const ikm = await crypto.subtle.importKey(
    "raw",
    encoder.encode(serverSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );

  // google_sub を salt として使用し、AES-GCM 256bit キーを導出
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(googleSub),
      info: encoder.encode("vantagemail-kek"),
    },
    ikm,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** ランダムな DEK（Data Encryption Key）を生成する */
export function generateDEK(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** DEK の raw bytes を AES-GCM CryptoKey としてインポートする */
export async function importDEK(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM", length: 256 },
    true, // extractable: KEKで再暗号化するために export できる必要がある
    ["encrypt", "decrypt"],
  );
}

/** AES-GCM で暗号化する。IV は毎回ランダム生成 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<EncryptedData> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext),
  );

  return {
    ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
    iv: uint8ToBase64(iv),
  };
}

/** AES-GCM で復号する */
export async function decrypt(
  key: CryptoKey,
  data: EncryptedData,
): Promise<string> {
  const decoder = new TextDecoder();
  const ciphertext = base64ToUint8(data.ciphertext);
  const iv = base64ToUint8(data.iv);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return decoder.decode(plaintext);
}

/** DEK の raw bytes を暗号化する（KEK で暗号化して DB に保存する用途） */
export async function encryptDEK(
  kek: CryptoKey,
  dek: Uint8Array,
): Promise<EncryptedData> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    kek,
    dek,
  );

  return {
    ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
    iv: uint8ToBase64(iv),
  };
}

/** 暗号化された DEK を復号する（DB から読み出して KEK で復号する用途） */
export async function decryptDEK(
  kek: CryptoKey,
  data: EncryptedData,
): Promise<Uint8Array> {
  const ciphertext = base64ToUint8(data.ciphertext);
  const iv = base64ToUint8(data.iv);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    kek,
    ciphertext,
  );

  return new Uint8Array(plaintext);
}

// --- base64 ユーティリティ ---

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
