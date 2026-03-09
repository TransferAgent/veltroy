import { useState } from "react";
import { AuthBackground } from "@/components/AuthBackground";
import { OtpInput } from "@/components/OtpInput";
import { storeAuth } from "@/lib/auth";

type Screen = "form" | "otp";
type Mode = "signin" | "register";

export default function LoginPage() {
  const [screen, setScreen] = useState<Screen>("form");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const [pendingToken, setPendingToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpReset, setOtpReset] = useState(0);
  const [resendMessage, setResendMessage] = useState("");
  const [labCode, setLabCode] = useState("");

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
      if (data.requiresMfa) {
        setPendingToken(data.pendingToken);
        setMaskedEmail(data.maskedEmail);
        setLabCode(data.lab_code || '');
        setScreen("otp");
        return;
      }
      if (data.token) {
        storeAuth(data.token, data.user);
        setFadeOut(true);
        setTimeout(() => { window.location.href = "/"; }, 300);
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
      if (data.requiresMfa) {
        setPendingToken(data.pendingToken);
        setMaskedEmail(data.maskedEmail);
        setLabCode(data.lab_code || '');
        setScreen("otp");
        return;
      }
      if (data.auto_login && data.token) {
        storeAuth(data.token, data.user);
        setFadeOut(true);
        setTimeout(() => { window.location.href = "/"; }, 300);
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpComplete(code: string) {
    setOtpError("");
    setOtpLoading(true);
    setResendMessage("");
    try {
      const res = await fetch("/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, otp_code: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || "Verification failed");
        setOtpReset((r) => r + 1);
        return;
      }
      if (data.token) {
        storeAuth(data.token, data.user);
        setFadeOut(true);
        setTimeout(() => { window.location.href = "/"; }, 300);
      }
    } catch {
      setOtpError("Network error. Try again.");
      setOtpReset((r) => r + 1);
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleResend() {
    setResendMessage("");
    setOtpError("");
    try {
      const res = await fetch("/auth/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setOtpError(data.error || "Please wait before requesting a new code.");
        return;
      }
      if (!res.ok) {
        setOtpError(data.error || "Resend failed");
        return;
      }
      if (data.lab_code) setLabCode(data.lab_code);
      setResendMessage("New code sent. Check Replit Logs.");
      setOtpReset((r) => r + 1);
    } catch {
      setOtpError("Network error. Try again.");
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

  if (screen === "otp") {
    return (
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
        <AuthBackground />
        <div style={cardStyle} data-testid="otp-screen">
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>
              <span style={{ color: '#63B3ED' }}>&#x1f6e1;&#xfe0f;</span>
            </div>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '4px 0' }}
                data-testid="text-otp-title">
              Verify Your Identity
            </h1>
            <p style={{ color: '#A0AEC0', fontSize: 13, margin: '8px 0 0 0' }}>
              A 6-digit code was sent to:
            </p>
            <p style={{ color: '#63B3ED', fontWeight: 'bold', fontSize: 14, margin: '4px 0 0 0' }}
               data-testid="text-masked-email">
              {maskedEmail}
            </p>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <OtpInput
              onComplete={handleOtpComplete}
              disabled={otpLoading}
              error={otpError}
              reset={otpReset}
            />
          </div>

          {otpLoading && (
            <p style={{ color: '#63B3ED', fontSize: '0.85rem', textAlign: 'center', margin: '0 0 12px 0' }}
               data-testid="text-verifying">
              Verifying...
            </p>
          )}

          {labCode && (
            <div style={{
              background: 'rgba(99,179,237,0.08)',
              border: '1px solid rgba(99,179,237,0.25)',
              borderRadius: 8,
              padding: '10px 16px',
              margin: '0 0 12px 0',
              textAlign: 'center',
            }} data-testid="lab-code-display">
              <p style={{ color: '#A0AEC0', fontSize: '0.7rem', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: 1 }}>
                Lab Mode — Your Code
              </p>
              <p style={{ color: '#63B3ED', fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', margin: 0, letterSpacing: 6 }}
                 data-testid="text-lab-code">
                {labCode}
              </p>
            </div>
          )}

          {resendMessage && (
            <p style={{ color: '#48BB78', fontSize: '0.8rem', textAlign: 'center', margin: '0 0 12px 0' }}
               data-testid="text-resend-success">
              {resendMessage}
            </p>
          )}

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <p style={{ color: '#718096', fontSize: '0.8rem', margin: '0 0 8px 0' }}>
              Didn't receive a code?
            </p>
            <button
              onClick={handleResend}
              style={{
                background: 'none',
                border: '1px solid rgba(99,179,237,0.3)',
                borderRadius: 8,
                color: '#63B3ED',
                padding: '8px 20px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 200ms',
              }}
              onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.background = 'rgba(99,179,237,0.1)'; }}
              onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.background = 'none'; }}
              data-testid="button-resend"
            >
              Resend Code
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <span
              style={{ color: '#718096', fontSize: '0.8rem', cursor: 'pointer' }}
              onClick={() => {
                setScreen('form');
                setPendingToken('');
                setMaskedEmail('');
                setOtpError('');
                setResendMessage('');
                setLabCode('');
              }}
              data-testid="link-back-to-login"
            >
              ← Back to login
            </span>
          </div>

          <p style={{ color: '#4A5568', fontSize: '0.7rem', textAlign: 'center', marginTop: '1rem' }}>
            {labCode ? 'Code expires in 10 minutes. Enter your code above.' : 'Code expires in 10 minutes. Check Replit Logs for delivery.'}
          </p>
        </div>
      </div>
    );
  }

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
