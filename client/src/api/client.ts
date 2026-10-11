/**
 * Typed API Client for KaizenAI / HealTest Backend
 * Handles CSRF sessions, Bearer token authorization, error wrapping, and live API endpoints.
 */

export interface UserSession {
  email: string;
  name: string;
  role: string;
  token?: string;
  loggedIn?: boolean;
}

export interface Site {
  id: number;
  name: string;
  base_url: string;
  allowed_origins_json?: string;
  created_at?: string;
}

export interface RunItem {
  id: number;
  intent_id: number;
  intent_name?: string;
  snapshot_id?: number | null;
  site_id?: number;
  site_name?: string;
  verdict: 'PASS' | 'HEALED_PASS' | 'APP_BUG' | 'NEEDS_REVIEW' | 'FAIL_UNREPAIRABLE' | 'PROPOSED' | string;
  started_at: string;
  finished_at?: string | null;
  explanation?: string | null;
  llm_calls?: number;
  evidence_json?: string | null;
}

export interface CompareResponse {
  sites: Site[];
  selectedChangeId: number | null;
  change: {
    id: number;
    kind: string;
    severity: string;
    classification: string;
    explanation: string;
    created_at: string;
  } | null;
  vA: {
    id: number;
    version_label: string;
    captured_at: string;
    screenshot_path: string | null;
    path: string;
  } | null;
  vB: {
    id: number;
    version_label: string;
    captured_at: string;
    screenshot_path: string | null;
    path: string;
  } | null;
  diffs: Array<{
    type: string;
    selector: string;
    detail: string;
    status: string;
  }>;
  domChanges: Array<{
    kind: string;
    severity: string;
    explanation: string;
  }>;
  snapshots: Array<{
    id: number;
    version_label: string;
    captured_at: string;
    path: string;
  }>;
}

export interface AnalyticsResponse {
  sites: Site[];
  summary: {
    totalRuns: number;
    passRate: number;
    healedRate: number;
    appBugRate: number;
    reviewRate: number;
    totalSavingsUsd: number;
    avgLlmCalls: number;
  };
  metrics: {
    totalIntents: number;
    totalSnapshots: number;
    totalChanges: number;
    activeSites: number;
  };
  failureClusters: Array<{
    title: string;
    count: number;
    percentage: number;
    severity: string;
  }>;
}

export interface ChatMessage {
  id: string;
  sender: string;
  role: 'user' | 'assistant' | 'agent';
  agentBadge?: string;
  text: string;
  codeSnippet?: string;
  timestamp: string;
}

let csrfToken: string | null = null;

export function getStoredUser(): UserSession | null {
  try {
    const raw = localStorage.getItem('healtest_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: UserSession | null): void {
  if (user) {
    localStorage.setItem('healtest_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('healtest_user');
  }
}

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<Response> {
  if (!csrfToken) {
    try {
      const s = await fetch('/api/session');
      if (s.ok) {
        const data = await s.json();
        csrfToken = data.csrf || null;
      }
    } catch {
      // Ignore initial session error
    }
  }

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (csrfToken && !headers.has('X-CSRF-Token')) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const user = getStoredUser();
  if (user?.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${user.token}`);
  }

  return fetch(endpoint, {
    ...options,
    headers,
  });
}

export const api = {
  // Auth
  async login(credentials: { email: string; password?: string }) {
    const res = await fetchWithAuth('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Login failed');
    }
    const data = await res.json();
    setStoredUser({ ...data.user, token: data.token, loggedIn: true });
    return data;
  },

  async signup(data: { email: string; password?: string; name?: string }) {
    const res = await fetchWithAuth('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Signup failed');
    }
    const respData = await res.json();
    setStoredUser({ ...respData.user, token: respData.token, loggedIn: true });
    return respData;
  },

  logout() {
    setStoredUser(null);
  },

  // Overview & Sites
  async getSites(): Promise<Site[]> {
    const res = await fetchWithAuth('/api/sites');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.sites || [];
  },

  async getRuns(): Promise<RunItem[]> {
    const res = await fetchWithAuth('/api/runs');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.runs || [];
  },

  // Visual Compare
  async getCompare(changeId?: number): Promise<CompareResponse> {
    const url = changeId ? `/api/compare?changeId=${changeId}` : '/api/compare';
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error('Failed to load comparison data');
    return res.json();
  },

  // Analytics
  async getAnalytics(days = 30): Promise<AnalyticsResponse> {
    const res = await fetchWithAuth(`/api/analytics?days=${days}`);
    if (!res.ok) throw new Error('Failed to load analytics data');
    return res.json();
  },

  // Simulation & Agent Run
  async triggerSimulation(scenario: 'pass' | 'drift' | 'bug', targetUrl?: string) {
    const res = await fetchWithAuth('/api/agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, targetUrl: targetUrl || 'http://127.0.0.1:4102' }),
    });
    if (!res.ok) throw new Error('Simulation failed to trigger');
    return res.json();
  },

  // Multi-Agent Chat
  async sendChatMessage(prompt: string, agent?: string) {
    const res = await fetchWithAuth('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, agent: agent || 'Auto' }),
    });
    if (!res.ok) throw new Error('Failed to send message to AI');
    return res.json();
  },

  // Reports
  async getReports() {
    const res = await fetchWithAuth('/api/reports');
    if (!res.ok) return { reports: [] };
    return res.json();
  },

  // Storage
  async getStorage() {
    const res = await fetchWithAuth('/api/storage');
    if (!res.ok) return { tables: [] };
    return res.json();
  },

  // Settings
  async getSettings() {
    const res = await fetchWithAuth('/api/settings');
    if (!res.ok) return {};
    return res.json();
  },
};
