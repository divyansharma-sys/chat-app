// End-to-End Encryption (E2EE) Module
// Uses Web Crypto API (ECDH P-256 for key agreement + AES-GCM 256-bit for data encryption)
// Private keys stay local in IndexedDB; Public keys are published to Firestore.

const DB_NAME = 'chatflow_crypto_db'
const DB_VERSION = 1
const STORE_NAME = 'user_keys'

function openCryptoDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'uid' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Base64 helpers
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

export function base64ToBuffer(base64) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// In-memory cache for fast lookups
const keyCache = {
  keyPair: null,
  uid: null,
  sharedKeys: new Map(), // key: otherUid, val: CryptoKey
  groupKeys: new Map()   // key: groupId, val: CryptoKey
}

/**
 * Initializes or retrieves the ECDH keypair for the given user.
 * Returns { publicKeyJwk, privateKey }
 */
export async function getOrGenerateKeyPair(uid) {
  if (keyCache.uid === uid && keyCache.keyPair) {
    return keyCache.keyPair
  }

  const db = await openCryptoDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)

  const existing = await new Promise((resolve) => {
    const req = store.get(uid)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })

  if (existing && existing.privateKeyJwk && existing.publicKeyJwk) {
    try {
      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        existing.privateKeyJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      )
      const result = {
        publicKeyJwk: existing.publicKeyJwk,
        privateKey
      }
      keyCache.uid = uid
      keyCache.keyPair = result
      return result
    } catch (e) {
      console.warn('Failed to import existing key from IndexedDB, re-generating:', e)
    }
  }

  // Generate a new key pair
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )

  const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey)
  const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey)

  // Save to IndexedDB
  const writeTx = db.transaction(STORE_NAME, 'readwrite')
  const writeStore = writeTx.objectStore(STORE_NAME)
  await new Promise((resolve, reject) => {
    const req = writeStore.put({
      uid,
      publicKeyJwk,
      privateKeyJwk,
      createdAt: Date.now()
    })
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })

  const result = {
    publicKeyJwk,
    privateKey: keyPair.privateKey
  }
  keyCache.uid = uid
  keyCache.keyPair = result
  return result
}

/**
 * Derives a 256-bit AES-GCM shared key from Alice's private key and Bob's public key JWK.
 */
export async function getSharedKey(myPrivateKey, otherPublicKeyJwk, otherUid) {
  if (otherUid && keyCache.sharedKeys.has(otherUid)) {
    return keyCache.sharedKeys.get(otherUid)
  }

  if (!otherPublicKeyJwk) {
    return null
  }

  try {
    const theirPublicKey = await window.crypto.subtle.importKey(
      'jwk',
      otherPublicKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    )

    const sharedKey = await window.crypto.subtle.deriveKey(
      { name: 'ECDH', public: theirPublicKey },
      myPrivateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )

    if (otherUid) {
      keyCache.sharedKeys.set(otherUid, sharedKey)
    }
    return sharedKey
  } catch (err) {
    console.error('Error deriving shared key:', err)
    return null
  }
}

/**
 * Encrypts a plaintext string using an AES-GCM CryptoKey.
 * Returns { ciphertext: string (base64), iv: string (base64) }
 */
export async function encryptData(plainText, key) {
  if (!key) throw new Error('No encryption key provided')
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plainText)

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  )

  return {
    ciphertext: bufferToBase64(cipherBuffer),
    iv: bufferToBase64(iv.buffer)
  }
}

/**
 * Decrypts a base64 ciphertext using an AES-GCM CryptoKey and IV.
 * Returns decrypted plaintext string.
 */
export async function decryptData(ciphertextBase64, ivBase64, key) {
  if (!key) throw new Error('No decryption key available')
  const cipherBuffer = base64ToBuffer(ciphertextBase64)
  const ivBuffer = base64ToBuffer(ivBase64)

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    key,
    cipherBuffer
  )

  return new TextDecoder().decode(decryptedBuffer)
}

/**
 * Generate a new group symmetric key (256-bit AES-GCM) as exportable JWK
 */
export async function generateGroupKey() {
  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
  return await window.crypto.subtle.exportKey('jwk', key)
}

/**
 * Import a group key from JWK
 */
export async function importGroupKey(jwk) {
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}
