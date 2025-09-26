import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../utils/api";

import { useEffect, useMemo, useRef } from "react";
import "../styles/Register.css";
import { FiUser, FiLock } from "react-icons/fi";
import logoPng from "../assets/pwn_logo.png";
import { cryptoService } from "../lib/cryptoService";

// Simple password scoring function
function scorePassword(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score >= 3) return "strong";
  if (score === 2) return "medium";
  return "weak";
}

const USERNAME_RE = /^[a-zA-Z0-9]{3,30}$/;

function isValidUsername(u: string) {
  return USERNAME_RE.test(u.trim());
}

export default function Register() {
  const nav = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touchedPass, setTouchedPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // Parallax Effect Logic (rAF-throttled)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let raf = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const { clientX, clientY } = e;
        const { innerWidth, innerHeight } = window;
        const mouseX = (clientX / innerWidth - 0.5) * 18;
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

  const strength = useMemo(() => scorePassword(password), [password]);
  const showStrength = touchedPass && password.length > 0;

  function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  const USERNAME_RE = /^[A-Za-z0-9]{3,30}$/;

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Prevent double submits if a previous request is still running
    if (loading) return;

    setError(null);

    const uname = username.trim();
    if (!USERNAME_RE.test(uname)) {
      setError(
        "Username must be 3–30 alphanumeric characters (A–Z, a–z, 0–9)."
      );
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setStatus("Generating keys...");

    try {
      // 1) Generate identity (prefer native/libsignal if available)
      let publicBundle: any = null;
      let privateMaterial: any = null;
      if ((window as any).electronCrypto?.nativeEnabled && typeof (window as any).electronCrypto?.generateLSAccount === 'function') {
        const acc = await (window as any).electronCrypto.generateLSAccount();
        if ((acc as any)?.error) throw new Error((acc as any).error);
        // Build server-facing bundle from account info (avoid getPreKeyBundle crash paths)
        publicBundle = {
          registrationId: acc.registrationId,
          identityKeyB64: acc.identityKeyB64,
          signedPreKey: acc.signedPreKey,
          ...(Array.isArray(acc.oneTimePreKeys) && acc.oneTimePreKeys.length
            ? { oneTimePreKey: { id: acc.oneTimePreKeys[0].id ?? 1, pubB64: acc.oneTimePreKeys[0].pubB64 || acc.oneTimePreKeys[0].publicKeyB64 } }
            : {}),
        } as any;
        // Optional prekeys to upload to backend pool
        try {
          if (Array.isArray((acc as any).oneTimePreKeys) && (acc as any).oneTimePreKeys.length > 0) {
            const mapped = (acc as any).oneTimePreKeys.map((k: any) => ({ publicKeyB64: k.pubB64 || k.publicKeyB64 }));
            try { await window.electronAPI.saveOPKs?.(mapped as any); } catch {}
            try { await (await import('../utils/api')).keyAPI.topUpPrekeys(mapped); } catch {}
          }
        } catch {}
      } else {
        // Dev bridge fallback
        const res = await window.electronCrypto.generateIdentity();
        publicBundle = res.publicBundle;
        privateMaterial = res.privateMaterial;
      }

      // 2) Unlock & save keys locally
      setStatus("Unlocking secure store...");
      await window.electronAPI.unlockDB(password, uname);

      // Save only when dev bridge generated private material
      if (privateMaterial) {
        setStatus("Saving keys...");
        await window.electronAPI.saveKeys(privateMaterial);
      }

      // 3) Optional: one-time prekeys (dev bridge path)
      let oneTimePreKeys: Array<{ publicKeyB64: string }> | undefined;
      if (!publicBundle?.registrationId && typeof window.electronCrypto.generateOneTimePreKeys === "function") {
        try {
          setStatus("Preparing prekeys...");
          oneTimePreKeys = await window.electronCrypto.generateOneTimePreKeys(
            20
          );
          try { await window.electronAPI.saveOPKs(oneTimePreKeys as any); } catch {}
        } catch {
          oneTimePreKeys = undefined;
        }
      }

      // 4) Register (with 429 retry)
      const payload: any = {
        username: uname,
        password,
        publicBundle,
        ...(oneTimePreKeys ? { oneTimePreKeys } : {}),
      };

      let attempt = 0;
      const maxAttempts = 3;
      for (;;) {
        try {
          setStatus(
            attempt
              ? `Registering (retry ${attempt}/${maxAttempts - 1})...`
              : "Creating your account..."
          );
          await authAPI.register(payload);
          break; // success
        } catch (err: any) {
          const status = err?.response?.status;
          const data = err?.response?.data;

          // Surface 400s (validation etc.) immediately and stop
          if (status === 400) {
            setError(typeof data === "string" ? data : JSON.stringify(data));
            return;
          }

          // For 429, back off and retry a couple times
          if (status === 429 && attempt < maxAttempts - 1) {
            const delay = 500 * Math.pow(2, attempt); // 500ms, 1s
            await sleep(delay);
            attempt++;
            continue;
          }

          // Unknown/other errors
          const msg =
            data ?? err?.message ?? "Registration failed (unknown error)";
          setError(typeof msg === "string" ? msg : JSON.stringify(msg));
          return;
        }
      }

      // 5) Success → go to login
      nav("/login");
    } finally {
      // Always clear loading/status
      setLoading(false);
      setStatus("");
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
      <div className="auth-card register-card">
        <div className="brand">
          <img src={logoPng} alt="logo" className="logo-icon" />
          <h1 className="logo-text">PWNCHAT</h1>
        </div>

        <form className="auth-form" onSubmit={handleRegisterSubmit}>
          {error && <p className="auth-error">{error}</p>}
          <div className="input-group">
            <label className="input-label">Username</label>
            <div className="input-wrapper">
              <FiUser className="input-icon" />
              <input
                className="auth-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setTouchedPass(true)}
                disabled={loading}
              />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Confirm Password</label>
            <div className="input-wrapper">
              <FiLock className="input-icon" />
              <input
                type="password"
                className="auth-input"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {showStrength && (
            <div className="strength-section">
              <div className="strength-header">
                <span className={`strength-label ${strength}`}>
                  {strength.charAt(0).toUpperCase() + strength.slice(1)}
                </span>
                <span>Password strength</span>
              </div>
              <div className="strength-meter">
                <div className={`strength-fill ${strength}`} />
              </div>
            </div>
          )}

          <button type="submit" className="auth-button" disabled={loading}>
            {loading ? status || "Please wait..." : "Sign Up"}
          </button>
        </form>

        <div className="link-section">
          <p className="link-text">Already have an account?</p>
          <button
            className="link-button"
            onClick={() => nav("/login")}
            disabled={loading}
          >
            Login
          </button>
        </div>
      </div>
    </div>
  );
}
