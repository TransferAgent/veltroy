import { useState } from "react";
import { AuthBackground } from "@/components/AuthBackground";
import { storeAuth } from "@/lib/auth";

type Mode = "signin" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
  }

  function validateRegister(): string | null {
    if (!orgName.trim()) return "Organization name is required";
    if (!email.trim()) return "Email is required";
    if (password.length < 8) return "Password must be at least 8 characters";
    if (!/\d/.test(password)) return "Password must contain at least 1 number";
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
      return "Password must contain at least 1 special character";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setError("Invalid email or password");
        return;
      }
      if (res.status === 402) {
        setError("Your trial has expired. Contact us to upgrade.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      if (data.token) {
        storeAuth(data.token, data.user);
        setFadeOut(true);
        setTimeout(() => { window.location.href = "/"; }, 300);
      } else if (data.message?.includes("OTP")) {
        console.log("2FA screen coming in S5-03");
        setError("OTP verification required — coming in S5-03");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const valErr = validateRegister();
    if (valErr) { setError(valErr); return; }
    setLoading(true);
    try {
      const res = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, org_name: orgName }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setError("An account with this email already exists");
        return;
      }
      if (res.status === 400) {
        setError(data.error || "Validation error");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Registration failed");
        return;
      }
      if (data.auto_login && data.token) {
        storeAuth(data.token, data.user);
        setFadeOut(true);
        setTimeout(() => { window.location.href = "/"; }, 300);
      } else {
        setError("Check Replit logs for your verification code");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: fadeOut ? 'translate(-50%, -50%) scale(0.95)' : 'translate(-50%, -50%)',
    width: 420,
    maxWidth: '92vw',
    background: 'rgba(13, 20, 35, 0.90)',
    border: '1px solid rgba(99, 179, 237, 0.25)',
    borderRadius: 16,
    boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,179,237,0.1)',
    backdropFilter: 'blur(20px)',
    zIndex: 10,
    padding: '2rem',
    opacity: fadeOut ? 0 : 1,
    transition: 'opacity 300ms ease, transform 300ms ease',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(99,179,237,0.2)',
    borderRadius: 8,
    color: '#E2E8F0',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    color: '#A0AEC0',
    fontSize: '0.8rem',
    marginBottom: 6,
    fontWeight: 500,
  };

  const tabBase: React.CSSProperties = {
    flex: 1,
    padding: '8px 0',
    border: 'none',
    borderRadius: 6,
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 200ms ease',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <AuthBackground />
      <div style={cardStyle}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 28, marginBottom: 4 }}>
            <span style={{ color: '#63B3ED' }}>&#x1f6e1;&#xfe0f;</span>
          </div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '4px 0' }}
              data-testid="text-login-title">
            NDR PLATFORM
          </h1>
          <p style={{ color: '#718096', fontSize: 13, margin: 0 }}>
            Enterprise Network Detection &amp; Response
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: 4,
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          padding: 3,
          marginBottom: '1.5rem',
        }}>
          <button
            style={{
              ...tabBase,
              background: mode === 'signin' ? 'rgba(99,179,237,0.15)' : 'transparent',
              color: mode === 'signin' ? '#63B3ED' : '#718096',
            }}
            onClick={() => switchMode('signin')}
            data-testid="button-tab-signin"
          >
            Sign In
          </button>
          <button
            style={{
              ...tabBase,
              background: mode === 'register' ? 'rgba(72,187,120,0.15)' : 'transparent',
              color: mode === 'register' ? '#48BB78' : '#718096',
            }}
            onClick={() => switchMode('register')}
            data-testid="button-tab-register"
          >
            Get Started
          </button>
        </div>

        {mode === 'signin' ? (
          <form onSubmit={handleSignIn}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                placeholder="your@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                required
                data-testid="input-login-email"
              />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                required
                data-testid="input-login-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px',
                background: loading ? '#2C5282' : '#2B6CB0',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 200ms',
              }}
              onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = '#2C5282'; }}
              onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = '#2B6CB0'; }}
              data-testid="button-signin"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
            {error && (
              <div style={{ color: '#FC8181', fontSize: '0.8rem', marginTop: 12, textAlign: 'center' }}
                   data-testid="text-login-error">
                {error}
              </div>
            )}
            <p style={{ color: '#718096', fontSize: '0.8rem', textAlign: 'center', marginTop: '1.25rem' }}>
              No account?{' '}
              <span
                style={{ color: '#48BB78', cursor: 'pointer', fontWeight: 500 }}
                onClick={() => switchMode('register')}
                data-testid="link-to-register"
              >
                Start your free 6-day trial
              </span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={labelStyle}>Organization Name</label>
              <input
                type="text"
                placeholder="Acme Security Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                style={inputStyle}
                required
                data-testid="input-register-org"
              />
            </div>
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                placeholder="your@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                required
                data-testid="input-register-email"
              />
            </div>
            <div style={{ marginBottom: '0.85rem' }}>
              <label style={labelStyle}>Password</label>
              <input
                type="password"
                placeholder="Min 8 chars, 1 number, 1 special"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
                required
                data-testid="input-register-password"
              />
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
                required
                data-testid="input-register-confirm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px',
                background: loading ? '#22543D' : '#276749',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 200ms',
              }}
              onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = '#22543D'; }}
              onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.background = '#276749'; }}
              data-testid="button-register"
            >
              {loading ? 'Creating account...' : 'Create Account & Start Trial'}
            </button>
            {error && (
              <div style={{ color: '#FC8181', fontSize: '0.8rem', marginTop: 12, textAlign: 'center' }}
                   data-testid="text-register-error">
                {error}
              </div>
            )}
            <p style={{ color: '#718096', fontSize: '0.75rem', textAlign: 'center', marginTop: 10 }}>
              6-day free trial · No credit card required
            </p>
            <p style={{ color: '#718096', fontSize: '0.8rem', textAlign: 'center', marginTop: 8 }}>
              Already have an account?{' '}
              <span
                style={{ color: '#63B3ED', cursor: 'pointer', fontWeight: 500 }}
                onClick={() => switchMode('signin')}
                data-testid="link-to-signin"
              >
                Sign In
              </span>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
