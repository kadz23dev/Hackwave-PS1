import crypto from 'node:crypto';
import { FIREBASE_CONFIG } from '../config.js';
import type { Repo } from '../db/repo.js';

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  token: string;
  isFirebase: boolean;
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function isMockApiKey(apiKey: string): boolean {
  return !apiKey || apiKey.startsWith('AIzaSyDummy') || apiKey.includes('Dummy') || apiKey.length < 20;
}

/**
 * Sign up a user.
 * Tries Firebase Identity Toolkit REST API first if a real API key is configured.
 * Seamlessly synchronizes with local SQLite and falls back to local DB if offline / mock key.
 */
export async function signUpUser(
  repo: Repo,
  payload: { email: string; password: string; name?: string }
): Promise<AuthUser> {
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;
  const displayName = (payload.name || email.split('@')[0] || 'User').trim();

  let firebaseUid: string | null = null;
  let token = 'tk_' + crypto.randomBytes(16).toString('hex');
  let isFirebase = false;

  if (!isMockApiKey(FIREBASE_CONFIG.apiKey)) {
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`;
      const fbRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      });

      if (fbRes.ok) {
        const data = (await fbRes.json()) as { idToken?: string; localId?: string };
        if (data.idToken && data.localId) {
          firebaseUid = data.localId;
          token = data.idToken;
          isFirebase = true;

          // Update display name on Firebase
          try {
            await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_CONFIG.apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                idToken: data.idToken,
                displayName,
                returnSecureToken: true,
              }),
            });
          } catch {
            // Ignore optional display name update failure
          }
        }
      } else {
        const errData = (await fbRes.json()) as { error?: { message?: string } };
        const msg = errData?.error?.message;
        if (msg === 'EMAIL_EXISTS') {
          throw new Error('An account with this email address already exists.');
        } else if (msg?.includes('WEAK_PASSWORD')) {
          throw new Error('Password should be at least 6 characters.');
        }
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('already exists') || err.message.includes('Password'))) {
        throw err;
      }
      // If network fails or Firebase is unreachable, proceed with local account creation
    }
  }

  // Check if email exists locally
  const existing = repo.db.prepare('SELECT id, email FROM users WHERE email = ?').get(email) as
    | { id: number; email: string }
    | undefined;

  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const pwHash = hashPassword(password);
  const localUid = firebaseUid ?? `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  repo.db
    .prepare(
      'INSERT INTO users (firebase_uid, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)'
    )
    .run(localUid, email, displayName, pwHash, 'developer');

  return {
    uid: localUid,
    email,
    displayName,
    role: 'developer',
    token,
    isFirebase,
  };
}

/**
 * Sign in a user.
 * Tries Firebase Identity Toolkit REST API first if a real API key is configured.
 * Seamlessly verifies against local SQLite if offline / mock key.
 */
export async function signInUser(
  repo: Repo,
  payload: { email: string; password: string }
): Promise<AuthUser> {
  const email = payload.email.trim().toLowerCase();
  const password = payload.password;

  let token = 'tk_' + crypto.randomBytes(16).toString('hex');
  let isFirebase = false;

  if (!isMockApiKey(FIREBASE_CONFIG.apiKey)) {
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_CONFIG.apiKey}`;
      const fbRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      });

      if (fbRes.ok) {
        const data = (await fbRes.json()) as {
          idToken?: string;
          localId?: string;
          displayName?: string;
        };
        if (data.idToken && data.localId) {
          isFirebase = true;
          token = data.idToken;

          // Upsert into local database
          const existing = repo.db
            .prepare('SELECT id, display_name, role FROM users WHERE email = ?')
            .get(email) as { id: number; display_name: string; role: string } | undefined;

          const dispName = data.displayName || existing?.display_name || email.split('@')[0];
          const role = existing?.role || 'developer';

          if (existing) {
            repo.db
              .prepare('UPDATE users SET firebase_uid = ?, display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(data.localId, dispName, existing.id);
          } else {
            repo.db
              .prepare(
                'INSERT INTO users (firebase_uid, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)'
              )
              .run(data.localId, email, dispName, hashPassword(password), role);
          }

          return {
            uid: data.localId,
            email,
            displayName: dispName,
            role,
            token,
            isFirebase,
          };
        }
      } else {
        const errData = (await fbRes.json()) as { error?: { message?: string } };
        const msg = errData?.error?.message;
        if (msg === 'EMAIL_NOT_FOUND' || msg === 'INVALID_PASSWORD' || msg === 'INVALID_LOGIN_CREDENTIALS') {
          throw new Error('Invalid email or password.');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('Invalid email or password')) {
        throw err;
      }
      // If network fails or Firebase is unreachable, proceed to local DB fallback
    }
  }

  // Local SQLite verification fallback
  const row = repo.db
    .prepare('SELECT id, firebase_uid, email, display_name, password_hash, role FROM users WHERE email = ?')
    .get(email) as
    | {
        id: number;
        firebase_uid: string | null;
        email: string;
        display_name: string;
        password_hash: string | null;
        role: string;
      }
    | undefined;

  if (!row) {
    // If demo lead email with demo password
    if (email === 'demo-lead@healtest.dev' && (password === 'demo123' || password === 'password')) {
      return {
        uid: 'demo-lead-uid-001',
        email,
        displayName: 'Demo Lead',
        role: 'admin',
        token,
        isFirebase: false,
      };
    }
    throw new Error('Invalid email or password.');
  }

  const pwHash = hashPassword(password);
  if (row.password_hash && row.password_hash !== pwHash) {
    throw new Error('Invalid email or password.');
  }

  return {
    uid: row.firebase_uid || `usr_${row.id}`,
    email: row.email,
    displayName: row.display_name || email.split('@')[0],
    role: row.role || 'developer',
    token,
    isFirebase: false,
  };
}

export function getCurrentUser(repo: Repo): AuthUser {
  const row = repo.db
    .prepare('SELECT id, firebase_uid, email, display_name, role FROM users ORDER BY id ASC LIMIT 1')
    .get() as
    | {
        id: number;
        firebase_uid: string | null;
        email: string;
        display_name: string;
        role: string;
      }
    | undefined;

  if (!row) {
    return {
      uid: 'demo-lead-uid-001',
      email: 'demo-lead@healtest.dev',
      displayName: 'Demo Lead',
      role: 'admin',
      token: 'session_token_guest',
      isFirebase: false,
    };
  }

  return {
    uid: row.firebase_uid || `usr_${row.id}`,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    token: 'session_token_active',
    isFirebase: false,
  };
}
