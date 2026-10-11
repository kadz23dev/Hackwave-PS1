import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface AuthPageProps {
  initialMode?: 'signin' | 'signup';
  onNavigate: (route: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ initialMode = 'signin', onNavigate }) => {
  const [isSignUp, setIsSignUp] = useState(initialMode === 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login, signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg('');
    setIsError(false);

    try {
      if (isSignUp) {
        await signup(email, password, name);
        setStatusMsg('✓ Account registered successfully! Redirecting...');
      } else {
        await login(email, password);
        setStatusMsg('✓ Signed in successfully! Redirecting...');
      }

      setTimeout(() => {
        onNavigate('#/');
      }, 600);
    } catch (err: any) {
      setIsError(true);
      setStatusMsg(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container min-h-screen flex items-center justify-center p-4">
      <div className="card morphism-card w-full max-w-md p-8">
        <div className="text-center mb-6">
          <div className="brand-crest inline-block mb-3 text-2xl font-bold p-3 rounded-xl bg-crimson text-white">
            K
          </div>
          <h1 className="text-2xl font-bold">
            {isSignUp ? 'Create your KaizenAI Account' : 'Sign In to KaizenAI'}
          </h1>
          <p className="text-muted text-sm mt-1">
            {isSignUp
              ? 'Join engineering teams running autonomous intent-aware tests'
              : 'Enter your credentials to access your autonomous test studio'}
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="segmented-control flex mb-6 p-1 bg-muted rounded-lg" role="tablist">
          <button
            type="button"
            className={`flex-1 py-2 text-sm font-semibold rounded-md ${!isSignUp ? 'bg-white shadow text-ink' : 'text-muted'}`}
            onClick={() => {
              setIsSignUp(false);
              setStatusMsg('');
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-sm font-semibold rounded-md ${isSignUp ? 'bg-white shadow text-ink' : 'text-muted'}`}
            onClick={() => {
              setIsSignUp(true);
              setStatusMsg('');
            }}
          >
            Sign Up
          </button>
        </div>

        {statusMsg && (
          <div className={`p-3 rounded-lg text-sm mb-4 ${isError ? 'bg-danger-soft text-danger border border-danger' : 'bg-success-soft text-success border border-success'}`}>
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {isSignUp && (
            <div>
              <label className="text-xs font-semibold uppercase text-muted block mb-1">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="chat-prompt-input w-full p-3 rounded-lg border"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase text-muted block mb-1">Work Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@company.com"
              className="chat-prompt-input w-full p-3 rounded-lg border"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase text-muted block mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="chat-prompt-input w-full p-3 rounded-lg border"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn--primary w-full py-3 mt-2 font-bold"
          >
            {loading ? 'Authenticating...' : isSignUp ? 'Create Account →' : 'Sign In →'}
          </button>

          <button
            type="button"
            className="text-xs text-muted hover:underline mt-2 text-center"
            onClick={() => onNavigate('#/')}
          >
            ← Skip & enter as Guest QA
          </button>
        </form>
      </div>
    </div>
  );
};
