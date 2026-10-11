import { useState } from "react";
import "./Login.css";

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setLoading(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Invalid credentials");

      setIsError(false);
      setStatusMsg("✓ Signed in successfully! Redirecting...");
      if (typeof window !== "undefined") {
        localStorage.setItem("healtest_user", JSON.stringify({ ...data.user, loggedIn: true }));
        setTimeout(() => {
          window.location.hash = "#/dashboard";
        }, 500);
      }
    } catch (err) {
      setIsError(true);
      setStatusMsg(err.message || "Failed to sign in. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setLoading(true);
    setStatusMsg("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Could not create account");

      setIsError(false);
      setStatusMsg("✓ Account created successfully! Redirecting...");
      if (typeof window !== "undefined") {
        localStorage.setItem("healtest_user", JSON.stringify({ ...data.user, loggedIn: true }));
        setTimeout(() => {
          window.location.hash = "#/dashboard";
        }, 500);
      }
    } catch (err) {
      setIsError(true);
      setStatusMsg(err.message || "Failed to create account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-root">
      <main className={`auth-card ${isSignUp ? "right-panel-active" : ""}`}>
        {/* Sign In Form Container (Left half) */}
        <div className="form-container sign-in-container">
          <form className="auth-form" onSubmit={handleSignIn}>
            <h2 className="auth-title">Login</h2>

            <div className="social-row">
              <button type="button" className="social-btn" aria-label="Facebook">
                <svg viewBox="0 0 24 24" className="social-icon">
                  <path fill="currentColor" d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </button>
              <button type="button" className="social-btn" aria-label="Twitter">
                <svg viewBox="0 0 24 24" className="social-icon">
                  <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>
              <button type="button" className="social-btn" aria-label="LinkedIn">
                <svg viewBox="0 0 24 24" className="social-icon">
                  <path fill="currentColor" d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                </svg>
              </button>
            </div>

            <p className="auth-subtitle">Or use your email address</p>

            <div className="input-pill">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-pill input-pill--password">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="pwd-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password"
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>

            <a href="#forgot" className="forgot-link">Forgot password?</a>

            {statusMsg && (
              <div className={`auth-msg ${isError ? "auth-msg--error" : "auth-msg--success"}`}>
                {statusMsg}
              </div>
            )}

            <button type="submit" className="submit-pill-btn" disabled={loading}>
              {loading ? "AUTHENTICATING..." : "LOGIN"}
            </button>
          </form>
        </div>

        {/* Sign Up Form Container (Right half) */}
        <div className="form-container sign-up-container">
          <form className="auth-form" onSubmit={handleSignUp}>
            <h2 className="auth-title">Sign Up</h2>

            <div className="social-row">
              <button type="button" className="social-btn" aria-label="Facebook">
                <svg viewBox="0 0 24 24" className="social-icon">
                  <path fill="currentColor" d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </button>
              <button type="button" className="social-btn" aria-label="Twitter">
                <svg viewBox="0 0 24 24" className="social-icon">
                  <path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </button>
              <button type="button" className="social-btn" aria-label="LinkedIn">
                <svg viewBox="0 0 24 24" className="social-icon">
                  <path fill="currentColor" d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                </svg>
              </button>
            </div>

            <p className="auth-subtitle">Or use your email address</p>

            <div className="input-pill">
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="input-pill">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="input-pill input-pill--password">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="pwd-toggle"
                onClick={() => setShowPassword(!showPassword)}
                aria-label="Toggle password"
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>

            {statusMsg && (
              <div className={`auth-msg ${isError ? "auth-msg--error" : "auth-msg--success"}`}>
                {statusMsg}
              </div>
            )}

            <button type="submit" className="submit-pill-btn" disabled={loading}>
              {loading ? "CREATING..." : "SIGN UP"}
            </button>
          </form>
        </div>

        {/* Sliding Overlay / Hero Container */}
        <div className="overlay-container">
          <div className="overlay">
            <div className="overlay-hero-bg" />
            <div className="overlay-hero-gradient" />

            {/* Left Overlay Content (Visible in Sign Up state) */}
            <div className="overlay-panel overlay-left">
              <h2 className="overlay-title">Welcome back</h2>
              <p className="overlay-desc">
                Login to review your latest self-healing test runs and AI agents.
              </p>
              <button
                type="button"
                className="overlay-ghost-btn"
                onClick={() => {
                  setIsSignUp(false);
                  setStatusMsg("");
                }}
              >
                LOGIN
              </button>
            </div>

            {/* Right Overlay Content (Visible in Sign In state) */}
            <div className="overlay-panel overlay-right">
              <h2 className="overlay-title">Hello there</h2>
              <p className="overlay-desc">
                Begin your journey using this software, and start earning now.
              </p>
              <button
                type="button"
                className="overlay-ghost-btn"
                onClick={() => {
                  setIsSignUp(true);
                  setStatusMsg("");
                }}
              >
                SIGN UP
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
