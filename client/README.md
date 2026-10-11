# KaizenAI React Frontend Architecture

## Overview
The frontend has been upgraded to a modern **React 19 + TypeScript + Vite** architecture. It provides full modularity, reactive state management, typed backend API communication, and seamless integration with the KaizenAI backend test engine.

---

## Directory Structure

```
client/
├── src/
│   ├── api/
│   │   └── client.ts             # Typed REST API client with CSRF & Bearer token auth
│   ├── context/
│   │   └── AuthContext.tsx       # Reactive authentication state & session persistence
│   ├── components/
│   │   ├── VerdictBadge.tsx      # Semantic status badges (PASS, HEALED, APP_BUG, etc.)
│   │   ├── Sidebar.tsx           # Dashboard navigation with theme switching
│   │   └── ChatDrawer.tsx        # Multi-Agent QA floating assistant & prompt starters
│   ├── views/
│   │   ├── LandingPage.tsx       # Reactive Landing page with interactive ROI calculator
│   │   ├── AuthPage.tsx          # Sign In & Sign Up authentication portal
│   │   ├── DashboardOverview.tsx # Live monitored sites & test run tables
│   │   ├── VisualCompare.tsx     # Before/After screenshot slider & DOM delta tree
│   │   ├── Analytics.tsx         # Longitudinal reliability stats & drift clustering
│   │   ├── RepairsGovernance.tsx # Audit log & human-in-the-loop candidate resolution
│   │   ├── StudioSimulation.tsx  # Playwright live replay studio & oracle monitoring
│   │   ├── ReportsStorage.tsx    # SQLite table explorer & audit report downloads
│   │   └── Settings.tsx          # Multi-agent LLM selection & Gemini API key status
│   ├── App.tsx                   # Master router coordinating all views
│   └── main.tsx                  # Application entry point with React 19 createRoot
├── index.html                    # Vite HTML entry template
├── tsconfig.json                 # Isolated TypeScript configuration for browser/JSX
└── dist/                         # Production build output
```

---

## Key Features

1. **Reactive State & Hooks**:
   - `useAuth()` hook for instant login/signup and token persistence in `localStorage`.
   - `useState` and `useEffect` for real-time API hydration, slider controls, and filters.

2. **Typed API Communication**:
   - [`api.getSites()`](file:///D:/Workspace/Projects/hackwave%203.0/Hackwave-PS1/client/src/api/client.ts) and [`api.getRuns()`](file:///D:/Workspace/Projects/hackwave%203.0/Hackwave-PS1/client/src/api/client.ts) for live test execution data.
   - [`api.getCompare(changeId)`](file:///D:/Workspace/Projects/hackwave%203.0/Hackwave-PS1/client/src/api/client.ts) for deep linking to inspect specific UI diffs.
   - [`api.triggerSimulation(scenario)`](file:///D:/Workspace/Projects/hackwave%203.0/Hackwave-PS1/client/src/api/client.ts) to execute live Playwright runs.
   - [`api.sendChatMessage(prompt)`](file:///D:/Workspace/Projects/hackwave%203.0/Hackwave-PS1/client/src/api/client.ts) for live Multi-Agent Gemini reasoning.

3. **Routing**:
   - Hash-based navigation (`#/`, `#/landing`, `#/login`, `#/signup`, `#/changes/:id`, `#/analytics`, `#/repairs`, `#/simulation`, `#/storage`, `#/settings`).

---

## Running the Application

### Development Mode (with Vite HMR & API Proxy):
```bash
npm run dev:client
```
Runs at `http://localhost:5173` with automatic proxying of `/api/*` to the backend server (`http://localhost:4300`).

### Production Build:
```bash
npm run build:client
# or full project build:
npm run build
```
Compiles TypeScript backend, SQL migrations, and bundles the React client into `client/dist/` in under 150ms.
