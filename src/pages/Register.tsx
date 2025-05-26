import React, { useState, useRef, MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Mail } from 'lucide-react';
import logoImg from '../assets/pwn_logo.png';
import '../styles/Register.css';

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

interface PasswordStrength {
  score: number;
  feedback: string;
  color: string;
  width: string;
}

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    feedback: '',
    color: '#535353',
    width: '0%'
  });

  
  const cardRef = useRef<HTMLDivElement>(null);
  const usernameWrapperRef = useRef<HTMLDivElement>(null);
  const passwordWrapperRef = useRef<HTMLDivElement>(null);
  const confirmPasswordWrapperRef = useRef<HTMLDivElement>(null);
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

  
  const validatePassword = (password: string): PasswordStrength => {
    let score = 0;
    let feedback = '';
    let color = '#535353';
    let width = '0%';

    if (password.length === 0) {
      return { score: 0, feedback: '', color: '#535353', width: '0%' };
    }

    
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    
    switch (score) {
      case 0:
      case 1:
        feedback = 'Weak';
        color = '#ff4444';
        width = '20%';
        break;
      case 2:
        feedback = 'Fair';
        color = '#ffa500';
        width = '40%';
        break;
      case 3:
        feedback = 'Good';
        color = '#44FF00';
        width = '68%';
        break;
      case 4:
      case 5:
        feedback = 'Strong';
        color = '#44FF00';
        width = '100%';
        break;
    }

    return { score, feedback, color, width };
  };

  const validateUsername = (username: string): boolean => {
    return /^[a-zA-Z0-9]{3,20}$/.test(username);
  };

  const isFormValid = (): boolean => {
    return (
      validateUsername(formData.username) &&
      passwordStrength.score >= 3 &&
      formData.password === formData.confirmPassword &&
      formData.password.length >= 8
    );
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (field === 'password') {
      setPasswordStrength(validatePassword(value));
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid()) return;
    
    setIsLoading(true);

    try {
      console.log('Registration attempt:', formData);
      
      setTimeout(() => {
        setIsLoading(false);
        navigate('/login');
      }, 2000);
    } catch (err) {
      console.error('Registration failed:', err);
      setIsLoading(false);
    }
  };

  const handleLoginClick = () => {
    navigate('/login');
  };

  const handleClose = () => window.electronAPI?.closeApp();

  return (
    <div className="register-container" onMouseMove={handleParallax}>
      <div className="register-background" ref={backgroundRef}>
        <div className="background-overlay" />
      </div>

      <button className="close-button" onClick={handleClose}>
        ×
      </button>

      <div
        className="register-card"
        ref={cardRef}
        onMouseMove={(e) => handleMouseMove(e, cardRef, "mouse")}
      >
        {/* Unified Logo System */}
        <div className="logo-section">
          <div className="logo-icon">
            <img src={logoImg} alt="pwnbuffer logo" width="32" height="32" />
          </div>
          <h1 className="logo">pwnbuffer.org</h1>
        </div>

        {/* Unified Form System */}
        <form className="register-form" onSubmit={handleRegister}>
          {/* Username Input */}
          <div className="input-group">
            <div
              className="input-glow-wrapper"
              ref={usernameWrapperRef}
              onMouseMove={(e) => handleMouseMove(e, usernameWrapperRef, "input-mouse")}
            >
              <div className="input-wrapper">
                <div className="input-icon">
                  <User size={16} />
                </div>
                <input
                  type="text"
                  placeholder="Username"
                  value={formData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  className={`register-input ${
                    formData.username && !validateUsername(formData.username) ? 'invalid' : ''
                  }`}
                  required
                />
              </div>
            </div>
            {formData.username && !validateUsername(formData.username) && (
              <div className="validation-error">Username must be 3-20 alphanumeric characters</div>
            )}
          </div>

          {/* Password Input */}
          <div className="input-group">
            <div
              className="input-glow-wrapper"
              ref={passwordWrapperRef}
              onMouseMove={(e) => handleMouseMove(e, passwordWrapperRef, "input-mouse")}
            >
              <div className="input-wrapper">
                <div className="input-icon">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  placeholder="Password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="register-input"
                  required
                />
              </div>
            </div>
          </div>

          {/* Confirm Password Input */}
          <div className="input-group">
            <div
              className="input-glow-wrapper"
              ref={confirmPasswordWrapperRef}
              onMouseMove={(e) => handleMouseMove(e, confirmPasswordWrapperRef, "input-mouse")}
            >
              <div className="input-wrapper">
                <div className="input-icon">
                  <Lock size={16} />
                </div>
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  className={`register-input ${
                    formData.confirmPassword && formData.password !== formData.confirmPassword ? 'invalid' : ''
                  }`}
                  required
                />
              </div>
            </div>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <div className="validation-error">Passwords do not match</div>
            )}
          </div>

          {/* Unified Password Strength System */}
          {formData.password && (
            <div className="password-strength-section">
              <div className="strength-feedback" style={{ color: passwordStrength.color }}>
                {passwordStrength.feedback}
              </div>
              <div className="strength-meter">
                <div 
                  className="strength-fill"
                  style={{
                    width: passwordStrength.width,
                    backgroundColor: passwordStrength.color,
                    boxShadow: `0px 0px 28px 2px ${passwordStrength.color}19`
                  }}
                />
              </div>
              <div className="strength-label">Password strength</div>
            </div>
          )}

          {/* Unified Button System */}
          <div
            className="button-glow-wrapper"
            ref={buttonWrapperRef}
            onMouseMove={(e) => handleMouseMove(e, buttonWrapperRef, "button-mouse")}
          >
            <button
              type="submit"
              className={`register-button ${isLoading ? "loading" : ""} ${!isFormValid() ? "disabled" : ""}`}
              disabled={isLoading || !isFormValid()}
            >
              {isLoading ? "" : "Register"}
            </button>
          </div>
        </form>

        {/* Unified Navigation System */}
        <div className="login-section">
          <p className="login-text">Already have an account?</p>
          <button type="button" className="login-button-register" onClick={handleLoginClick}>
            Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default Register;