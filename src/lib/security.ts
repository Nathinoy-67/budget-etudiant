/**
 * Verrouillage local : code PIN haché (PBKDF2-SHA256, sel aléatoire) + Face ID / Touch ID via WebAuthn.
 *
 * Limite assumée : sans serveur, ce verrou protège contre un regard indiscret ou un téléphone
 * prêté, pas contre quelqu'un qui aurait accès aux outils de développement du navigateur.
 */

const enc = new TextEncoder();

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150_000 }, key, 256);
  return toB64(bits);
}

export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: await pbkdf2(pin, salt), salt: toB64(salt) };
}

export async function verifyPin(pin: string, stored: { hash: string; salt: string }): Promise<boolean> {
  const hash = await pbkdf2(pin, fromB64(stored.salt));
  // comparaison à temps constant
  if (hash.length !== stored.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ stored.hash.charCodeAt(i);
  return diff === 0;
}

// ---------- Face ID / Touch ID (WebAuthn, authentificateur de la plateforme) ----------

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      typeof window !== 'undefined' &&
      !!window.PublicKeyCredential &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

/** Enregistre une clé locale protégée par Face ID / Touch ID. Retourne son identifiant. */
export async function registerBiometric(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Budget Étudiant', id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'budget-etudiant', displayName: 'Budget Étudiant' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Enregistrement annulé');
  return toB64(cred.rawId);
}

/** Demande Face ID / Touch ID. Vrai si l'utilisateur a été vérifié par l'appareil. */
export async function verifyBiometric(credentialId: string): Promise<boolean> {
  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromB64(credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!assertion) return false;
    const data = new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData);
    // octet 32 = flags ; bit 2 (0x04) = utilisateur vérifié (UV)
    return toB64(assertion.rawId) === credentialId && (data[32] & 0x04) === 0x04;
  } catch {
    return false;
  }
}
