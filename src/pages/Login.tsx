import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Login.css";
import { FiUser, FiLock } from "react-icons/fi";
import logoPng from "../assets/pwn_logo.png";
import { ACCESS_TOKEN_KEY, authAPI } from "../utils/api";
import { jwtDecode } from "jwt-decode";

export default function Login() {
  const nav = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  // UI state (kept exactly like your original)
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parallax Effect Logic (rAF-throttled for perf)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (raf) return; // throttle to next frame
      raf = requestAnimationFrame(() => {
        raf = 0;
        const { clientX, clientY } = e;
        const { innerWidth, innerHeight } = window;
        const mouseX = (clientX / innerWidth - 0.5) * 18; // reduced amplitude
        const mouseY = (clientY / innerHeight - 0.5) * 18;
        container.style.setProperty("--mouse-x", `${-mouseX}px`);
        container.style.setProperty("--mouse-y", `${-mouseY}px`);
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Submit handler bound to the form (fixes the prior type/exports issues)
  async function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // 1) Authenticate
      const data = await authAPI.login({ username: user, password: pass });
      const token = (data as any).accessToken || (data as any).token;
      if (!token) throw new Error("Login succeeded but no token returned");

      // 2) Persist token so api.ts attaches it to future calls
      localStorage.setItem(ACCESS_TOKEN_KEY, token);

      // 3) Unlock local DB using an account-scoped key (prefer userId from token)
      try {
        const decoded: any = jwtDecode(token);
        const accountKey = decoded?.userId || user;
        await (window as any).electronAPI?.unlockDB?.(pass, accountKey);
      } catch {
        // non-fatal during login
      }

      // 4) Go to chat
      nav("/chat");
    } catch (err: any) {
      const msg = err?.response?.data ?? err?.message ?? "Login failed";
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-container" ref={containerRef}>
      <div className="window-controls-auth">
        <button
          className="window-control minimize"
          onClick={() => window.electronAPI?.minimizeWindow?.()}
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="5" width="8" height="2" fill="currentColor" />
          </svg>
        </button>
        <button
          className="window-control maximize"
          onClick={() => window.electronAPI?.maximizeWindow?.()}
          title="Maximize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          className="window-control close"
          onClick={() => window.electronAPI?.closeWindow?.()}
          title="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="background-layer" />
      <div className="auth-card">
        <div className="brand">
          <img src={logoPng} alt="logo" className="logo-icon" />
          <h1 className="logo-text">PWNCHAT</h1>
        </div>
        <form className="auth-form" onSubmit={handleLoginSubmit}>
          {error && <p className="auth-error">{String(error)}</p>}
          <div className="input-group">
            <label className="input-label">Username</label>
            <div className="input-wrapper">
              <FiUser className="input-icon" />
              <input
                className="auth-input"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Password</label>
            <div className="input-wrapper">
              <FiLock className="input-icon" />
              <input
                type="password"
                className="auth-input"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>
          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? "Signing in…" : "Login"}
          </button>
        </form>
        <div className="link-section">
          <p className="link-text">Don't have an account?</p>
          <button className="link-button" onClick={() => nav("/register")}>
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
}
