/**
 * 暗号化操作の Effect Service。
 *
 * 背景: crypto.ts の各関数を Effect でラップし、エラーを型レベルで追跡する。
 * Web Crypto API の非同期操作を Effect.tryPromise で包み、
 * 適切なエラー型（KeyDerivationError, EncryptionError, DecryptionError）を付与する。
 *
 * EncryptedData インターフェースや base64 ユーティリティは plain な関数として
 * crypto.ts に残し、このファイルからインポートして使用する。
 */
import { Context, Effect, Layer } from "effect"
import {
  DecryptionError,
  EncryptionError,
  KeyDerivationError,
} from "@vantagemail/core"
import type { EncryptedData } from "../crypto.ts"
import { uint8ToBase64, base64ToUint8 } from "../crypto.ts"

export interface CryptoServiceImpl {
  /**
   * HKDF で KEK（Key Encryption Key）を導出する。
   * CRITICAL: salt/info の順序は固定（salt: "vantagemail-kek", info: googleSub）。
   * 変更すると既存の暗号化データが復号不能になる。
   */
  deriveKEK: (
    serverSecret: string,
    googleSub: string,
  ) => Effect.Effect<CryptoKey, KeyDerivationError>

  /** ランダムな DEK（Data Encryption Key）を生成する */
  generateDEK: () => Effect.Effect<Uint8Array>

  /** DEK の raw bytes を AES-GCM CryptoKey としてインポートする */
  importDEK: (rawKey: Uint8Array) => Effect.Effect<CryptoKey, KeyDerivationError>

  /** AES-GCM で平文を暗号化する */
  encrypt: (
    key: CryptoKey,
    plaintext: string,
  ) => Effect.Effect<EncryptedData, EncryptionError>

  /** AES-GCM で暗号文を復号する */
  decrypt: (
    key: CryptoKey,
    data: EncryptedData,
  ) => Effect.Effect<string, DecryptionError>

  /** DEK の raw bytes を KEK で暗号化する（DB 保存用） */
  encryptDEK: (
    kek: CryptoKey,
    dek: Uint8Array,
  ) => Effect.Effect<EncryptedData, EncryptionError>

  /** 暗号化された DEK を KEK で復号する（DB 読み出し用） */
  decryptDEK: (
    kek: CryptoKey,
    data: EncryptedData,
  ) => Effect.Effect<Uint8Array, DecryptionError>
}

export class CryptoService extends Context.Tag("CryptoService")<
  CryptoService,
  CryptoServiceImpl
>() {
  /**
   * Web Crypto API を使った実装の Layer。
   * 外部依存がないため、固定の Layer として提供する。
   */
  static live = Layer.succeed(CryptoService, {
    deriveKEK: (serverSecret, googleSub) =>
      Effect.tryPromise({
        try: async () => {
          const encoder = new TextEncoder()
          const ikm = await crypto.subtle.importKey(
            "raw",
            encoder.encode(serverSecret),
            "HKDF",
            false,
            ["deriveKey"],
          )
          // CRITICAL: salt と info の順序を変更しないこと。
          // salt: 固定のドメイン分離値、info: ユーザー固有の識別子（RFC 5869 準拠）
          return crypto.subtle.deriveKey(
            {
              name: "HKDF",
              hash: "SHA-256",
              salt: encoder.encode("vantagemail-kek"),
              info: encoder.encode(googleSub),
            },
            ikm,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"],
          )
        },
        catch: (e) =>
          new KeyDerivationError({ reason: String(e) }),
      }),

    generateDEK: () =>
      Effect.sync(() => crypto.getRandomValues(new Uint8Array(32))),

    importDEK: (rawKey) =>
      Effect.tryPromise({
        try: () =>
          crypto.subtle.importKey(
            "raw",
            rawKey.buffer as ArrayBuffer,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"],
          ),
        catch: (e) =>
          new KeyDerivationError({ reason: String(e) }),
      }),

    encrypt: (key, plaintext) =>
      Effect.tryPromise({
        try: async () => {
          const encoder = new TextEncoder()
          const iv = crypto.getRandomValues(new Uint8Array(12))
          const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
            key,
            encoder.encode(plaintext),
          )
          return {
            ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
            iv: uint8ToBase64(iv),
          }
        },
        catch: (e) =>
          new EncryptionError({ reason: String(e) }),
      }),

    decrypt: (key, data) =>
      Effect.tryPromise({
        try: async () => {
          const decoder = new TextDecoder()
          const ciphertext = base64ToUint8(data.ciphertext)
          const iv = base64ToUint8(data.iv)
          const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
            key,
            ciphertext.buffer as ArrayBuffer,
          )
          return decoder.decode(plaintext)
        },
        catch: (e) =>
          new DecryptionError({ reason: String(e) }),
      }),

    encryptDEK: (kek, dek) =>
      Effect.tryPromise({
        try: async () => {
          const iv = crypto.getRandomValues(new Uint8Array(12))
          const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
            kek,
            dek.buffer as ArrayBuffer,
          )
          return {
            ciphertext: uint8ToBase64(new Uint8Array(ciphertext)),
            iv: uint8ToBase64(iv),
          }
        },
        catch: (e) =>
          new EncryptionError({ reason: String(e) }),
      }),

    decryptDEK: (kek, data) =>
      Effect.tryPromise({
        try: async () => {
          const ciphertext = base64ToUint8(data.ciphertext)
          const iv = base64ToUint8(data.iv)
          const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
            kek,
            ciphertext.buffer as ArrayBuffer,
          )
          return new Uint8Array(plaintext)
        },
        catch: (e) =>
          new DecryptionError({ reason: String(e) }),
      }),
  })
}
