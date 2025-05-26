import React, { useState, useRef, MouseEvent } from "react";
import { useNavigate } from 'react-router-dom';
import "../styles/Login.css";
import { User, Lock, X } from "lucide-react";
import logoImg from "../assets/pwn_logo.png";


const handleClose = async () => {
  try {
    await window.electronAPI?.closeApp()
  } catch (error) {
    console.error('Failed to close app:', error)
    if (typeof window !== 'undefined') {
      window.close()
    }
  }
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const usernameWrapperRef = useRef<HTMLDivElement>(null);
  const passwordWrapperRef = useRef<HTMLDivElement>(null);
  const buttonWrapperRef = useRef<HTMLDivElement>(null);

  const backgroundRef = useRef<HTMLDivElement>(null);


  const handleParallax = (e: MouseEvent<HTMLDivElement>) => {
    if (!backgroundRef.current) return;

    const xRatio = e.clientX / window.innerWidth - 0.5;  
    const yRatio = e.clientY / window.innerHeight - 0.5;

    backgroundRef.current.style.setProperty("--bg-x", `${xRatio * 40}px`); 
    backgroundRef.current.style.setProperty("--bg-y", `${yRatio * 40}px`);
  };

  const handleMouseMove = (
    e: MouseEvent<HTMLDivElement>,
    ref: React.RefObject<HTMLDivElement>,
    varPrefix: string
  ) => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ref.current.style.setProperty(`--${varPrefix}-x`, `${x}px`);
    ref.current.style.setProperty(`--${varPrefix}-y`, `${y}px`);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      console.log("Login attempt:", { username, password });
      setTimeout(() => setIsLoading(false), 2000);
    } catch (err) {
      console.error("Login failed:", err);
      setIsLoading(false);
    }
  };

  const handleClose = () => window.electronAPI?.closeApp();

  const handleSignUp = () => {
    navigate('/register');
  };

  return (
  
    <div className="login-container" onMouseMove={handleParallax}>
      <div className="login-background" ref={backgroundRef}>
        <div className="background-overlay" />
      </div>

      <button className="close-button" onClick={handleClose}>
        ×
      </button>

      {}
      <div
        className="login-card"
        ref={cardRef}
        onMouseMove={(e) => handleMouseMove(e, cardRef, "mouse")}
      >
        {}
        <div className="logo-section">
          <div className="logo-icon">
            <img src={logoImg} alt="pwnbuffer logo" width="32" height="32" />
          </div>
          <h1 className="logo">pwnbuffer.org</h1>
        </div>

        {}
        <form className="login-form" onSubmit={handleLogin}>
          {}
          <div className="input-group">
            <div
              className="input-glow-wrapper"
              ref={usernameWrapperRef}
              onMouseMove={(e) =>
                handleMouseMove(e, usernameWrapperRef, "input-mouse")
              }
            >
              <div className="input-wrapper">
                <div className="input-icon">
                  <User size={16} />
                </div>
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input"
                  required
                />
              </div>
            </div>
          </div>

          {}
          <div className="input-group">
            <div
              className="input-glow-wrapper"
              ref={passwordWrapperRef}
              onMouseMove={(e) =>
                handleMouseMove(e, passwordWrapperRef, "input-mouse")
              }
            >
              <div className="input-wrapper">
                <div className="input-icon">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input"
                  required
                />
              </div>
            </div>
          </div>

          {}
          <div
            className="button-glow-wrapper"
            ref={buttonWrapperRef}
            onMouseMove={(e) => handleMouseMove(e, buttonWrapperRef, "button-mouse")}
          >
            <button
              type="submit"
              className={`login-button ${isLoading ? "loading" : ""}`}
              disabled={isLoading}
            >
              {isLoading ? "" : "Login"}
            </button>
          </div>
        </form>

        {}
        <div className="signup-section">
          <p className="signup-text">Don't have an account?</p>
          <button type="button" className="signup-button" onClick={handleSignUp}>
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
};