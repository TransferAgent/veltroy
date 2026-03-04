import { useState, useRef, useEffect, useCallback } from 'react';

interface OtpInputProps {
  onComplete: (code: string) => void;
  disabled?: boolean;
  error?: string;
  reset?: number;
}

export function OtpInput({ onComplete, disabled, error, reset }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    setDigits(['', '', '', '', '', '']);
    inputRefs.current[0]?.focus();
  }, [reset]);

  const handleChange = useCallback((index: number, value: string) => {
    if (disabled) return;

    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6);
      if (pasted.length >= 2) {
        const newDigits = [...digits];
        for (let i = 0; i < 6; i++) {
          newDigits[i] = pasted[i] || '';
        }
        setDigits(newDigits);
        if (pasted.length === 6) {
          onComplete(pasted);
        } else {
          inputRefs.current[Math.min(pasted.length, 5)]?.focus();
        }
        return;
      }
    }

    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5) {
      const code = newDigits.join('');
      if (code.length === 6) {
        onComplete(code);
      }
    }
  }, [digits, disabled, onComplete]);

  const handleKeyDown = useCallback((index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    if (pasted.length === 6) {
      onComplete(pasted);
    } else {
      inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    }
  }, [onComplete]);

  const boxStyle: React.CSSProperties = {
    width: 48,
    height: 56,
    textAlign: 'center',
    fontSize: '1.5rem',
    fontWeight: 700,
    letterSpacing: 0,
    background: 'rgba(255,255,255,0.06)',
    border: `1.5px solid ${error ? '#FC8181' : 'rgba(99,179,237,0.3)'}`,
    borderRadius: 10,
    color: '#E2E8F0',
    outline: 'none',
    transition: 'border-color 200ms, box-shadow 200ms',
    caretColor: '#63B3ED',
  };

  return (
    <div data-testid="otp-input-container">
      <div style={{
        display: 'flex',
        gap: 8,
        justifyContent: 'center',
        marginBottom: error ? 8 : 0,
      }}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => {
              e.target.style.borderColor = '#63B3ED';
              e.target.style.boxShadow = '0 0 0 2px rgba(99,179,237,0.2)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = error ? '#FC8181' : 'rgba(99,179,237,0.3)';
              e.target.style.boxShadow = 'none';
            }}
            disabled={disabled}
            style={{
              ...boxStyle,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'text',
            }}
            data-testid={`otp-digit-${i}`}
            autoComplete="one-time-code"
          />
        ))}
      </div>
      {error && (
        <p style={{
          color: '#FC8181',
          fontSize: '0.8rem',
          textAlign: 'center',
          marginTop: 8,
        }} data-testid="otp-error">
          {error}
        </p>
      )}
    </div>
  );
}
