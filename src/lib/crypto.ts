export async function generateKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(data: string, key: CryptoKey): Promise<{ encryptedData: string; iv: string }> {
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(data);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedData
  );
  
  const encryptedBytes = new Uint8Array(cipherBuffer);
  // Convert to base64
  const encryptedData = btoa(String.fromCharCode(...encryptedBytes));
  const ivString = btoa(String.fromCharCode(...iv));
  
  return { encryptedData, iv: ivString };
}

export async function decryptData(encryptedData: string, ivString: string, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(atob(ivString).split("").map((c) => c.charCodeAt(0)));
  const encryptedBytes = new Uint8Array(atob(encryptedData).split("").map((c) => c.charCodeAt(0)));
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encryptedBytes
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

// Store keys locally for the demo (in production, use KMS or derive from password)
export async function getOrCreateKey(): Promise<CryptoKey> {
  // In a real app, you'd securely derive this from a user password or use WebAuthn.
  // We use indexedDB or simply session-based keys for the prototype.
  return generateKey();
}
