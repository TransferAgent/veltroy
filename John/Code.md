# Code.md — From "Check the Logs" to "Code on the Card"

## What This Document Covers

In the old (legacy) version, when a user signed in and needed to enter their 6-digit OTP code, they had to go look at the server console logs to find it. That was clunky and confusing.

In the new version, the code appears **directly on the OTP card** in a styled blue box labeled "Lab Mode — Your Code." The user never touches the logs.

This document explains exactly how that works — backend to frontend — so you can replicate it.

---

## The Big Picture (Before vs. After)

### LEGACY (Old Way)
```
User signs in → Server generates OTP → Server prints code to console logs
                                         → User has to open Replit Logs tab
                                         → User reads code from log output
                                         → User types code into OTP boxes
```

### CURRENT (New Way)
```
User signs in → Server generates OTP → Server checks: is email service configured?
                                         → NO email service? Include lab_code in API response
                                         → Frontend reads lab_code from response
                                         → Frontend displays code in a styled box ON THE CARD
                                         → User reads code right there and types it in
```

---

## Part 1: What the Backend Does

### The Decision Point

The server checks if AWS SES (the email delivery service) is configured by looking for 4 environment variables:

```
AWS_SES_REGION
AWS_SES_FROM_EMAIL
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

If ALL FOUR exist, email is configured → codes are sent by email → `lab_code` is NOT included in the response.

If ANY are missing, email is NOT configured (lab mode) → `lab_code` IS included in the response.

### The Check (appears in 3 places on the backend)

```typescript
const hasSes = !!(
  process.env.AWS_SES_REGION &&
  process.env.AWS_SES_FROM_EMAIL &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
);
```

### Where lab_code Gets Added

The `lab_code` field is conditionally added to **three** API responses using the JavaScript spread operator:

```typescript
...(!hasSes && { lab_code: code })
```

This line means: "If `hasSes` is false (no email service), spread `{ lab_code: code }` into the response object. Otherwise, spread nothing."

#### Endpoint 1: POST /auth/login (sign in)
```typescript
return res.status(200).json({
  requiresMfa: true,
  maskedEmail: maskEmail(user.email),
  pendingToken,
  ...(!hasSes && { lab_code: code }),   // <-- HERE
});
```

#### Endpoint 2: POST /auth/register (new account)
```typescript
return res.status(201).json({
  tenant_id: tenantId,
  requiresMfa: true,
  maskedEmail: maskEmail(email),
  pendingToken,
  ...(!hasSes && { lab_code: code }),   // <-- HERE
});
```

#### Endpoint 3: POST /auth/resend-otp (resend button)
```typescript
return res.status(200).json({
  message: "New code sent. Check Replit Logs.",
  maskedEmail: maskEmail(email),
  ...(!hasSes && { lab_code: code }),   // <-- HERE
});
```

### What the API Response Looks Like

**Without email service (lab mode) — lab_code IS present:**
```json
{
  "requiresMfa": true,
  "maskedEmail": "s****@ndr-platform.io",
  "pendingToken": "eyJhbGciOiJIUzI1NiIs...",
  "lab_code": "482716"
}
```

**With email service configured — lab_code is ABSENT:**
```json
{
  "requiresMfa": true,
  "maskedEmail": "s****@ndr-platform.io",
  "pendingToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

The field simply does not exist when email is configured. It is not empty string. It is not null. The key is just not there.

---

## Part 2: What the Frontend Does

### Step 1: Declare the State Variable

In your login page component, create a state variable to hold the lab code:

```typescript
const [labCode, setLabCode] = useState("");
```

Initial value is empty string `""`. An empty string is falsy in JavaScript, which matters for conditional rendering later.

### Step 2: Capture lab_code From Every API Response

There are THREE places where the frontend calls the backend and might receive a `lab_code`. You must capture it in all three.

#### In the sign-in handler (POST /auth/login):
```typescript
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

    // ... handle errors (401, 402, etc.) ...

    if (data.requiresMfa) {
      setPendingToken(data.pendingToken);
      setMaskedEmail(data.maskedEmail);
      setLabCode(data.lab_code || '');     // <-- CAPTURE IT HERE
      setScreen("otp");                    // switch to OTP card
      return;
    }
  } catch {
    setError("Network error. Try again.");
  } finally {
    setLoading(false);
  }
}
```

**Key line:** `setLabCode(data.lab_code || '')` — If `lab_code` exists in the response, store it. If it doesn't exist (email service is configured), `data.lab_code` is `undefined`, and `undefined || ''` gives us empty string.

#### In the register handler (POST /auth/register):
```typescript
if (data.requiresMfa) {
  setPendingToken(data.pendingToken);
  setMaskedEmail(data.maskedEmail);
  setLabCode(data.lab_code || '');     // <-- SAME PATTERN
  setScreen("otp");
  return;
}
```

#### In the resend handler (POST /auth/resend-otp):
```typescript
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

    // ... handle rate limiting (429) ...

    if (data.lab_code) setLabCode(data.lab_code);   // <-- UPDATE WITH NEW CODE
    setResendMessage("New code sent. Check Replit Logs.");
    setOtpReset((r) => r + 1);    // resets the 6 input boxes
  } catch {
    setOtpError("Network error. Try again.");
  }
}
```

**Important:** When the user clicks "Resend Code," the server generates a NEW code. The old code is invalidated. The resend response includes the new `lab_code`, and we overwrite the state so the user sees the fresh code.

### Step 3: Clear lab_code When Going Back

When the user clicks "Back to login" to return to the sign-in form, clear ALL OTP state including `labCode`:

```typescript
onClick={() => {
  setScreen('form');
  setPendingToken('');
  setMaskedEmail('');
  setOtpError('');
  setResendMessage('');
  setLabCode('');           // <-- CLEAR IT
}}
```

If you forget this, stale codes will appear when the user navigates back and forward.

---

## Part 3: Rendering the Lab Code Box on the OTP Card

### Where It Goes in the Layout

The OTP card layout from top to bottom:

1. Shield emoji + "Verify Your Identity" title
2. "A 6-digit code was sent to:" + masked email
3. **Six OTP input boxes** (the `<OtpInput>` component)
4. "Verifying..." text (only while loading)
5. **Lab Mode code display box** ← THIS IS WHAT WE ARE ADDING
6. Resend success message (if applicable)
7. "Didn't receive a code?" + Resend Code button
8. "← Back to login" link
9. Footer text about code expiration

### The Conditional Render

The lab code box ONLY renders when `labCode` is a non-empty string (truthy):

```tsx
{labCode && (
  <div style={{
    background: 'rgba(99,179,237,0.08)',
    border: '1px solid rgba(99,179,237,0.25)',
    borderRadius: 8,
    padding: '10px 16px',
    margin: '0 0 12px 0',
    textAlign: 'center',
  }} data-testid="lab-code-display">

    <p style={{
      color: '#A0AEC0',
      fontSize: '0.7rem',
      margin: '0 0 4px 0',
      textTransform: 'uppercase',
      letterSpacing: 1,
    }}>
      Lab Mode — Your Code
    </p>

    <p style={{
      color: '#63B3ED',
      fontSize: '1.5rem',
      fontWeight: 700,
      fontFamily: 'monospace',
      margin: 0,
      letterSpacing: 6,
    }} data-testid="text-lab-code">
      {labCode}
    </p>

  </div>
)}
```

### Visual Breakdown of the Lab Code Box

```
┌─────────────────────────────────────┐
│  border: 1px solid                  │
│  rgba(99,179,237,0.25)              │
│  (translucent blue border)          │
│                                     │
│  background: rgba(99,179,237,0.08)  │
│  (very faint blue tint)             │
│                                     │
│     LAB MODE — YOUR CODE            │  ← #A0AEC0, 0.7rem, uppercase
│                                     │
│         4 8 2 7 1 6                 │  ← #63B3ED, 1.5rem, bold, monospace
│                                     │
│  border-radius: 8px                 │
│  padding: 10px 16px                 │
└─────────────────────────────────────┘
```

### Style Details for Each Part

**Container:**
| Property | Value |
|----------|-------|
| background | `rgba(99,179,237,0.08)` — very subtle blue tint |
| border | `1px solid rgba(99,179,237,0.25)` — translucent blue |
| border-radius | `8px` |
| padding | `10px 16px` |
| margin | `0 0 12px 0` — 12px space below it |
| text-align | `center` |

**Label text ("Lab Mode — Your Code"):**
| Property | Value |
|----------|-------|
| color | `#A0AEC0` — muted gray-blue |
| font-size | `0.7rem` |
| margin | `0 0 4px 0` — just 4px below the label |
| text-transform | `uppercase` |
| letter-spacing | `1px` |

**Code digits (e.g. "482716"):**
| Property | Value |
|----------|-------|
| color | `#63B3ED` — bright blue |
| font-size | `1.5rem` — large and readable |
| font-weight | `700` — bold |
| font-family | `monospace` — fixed-width for code appearance |
| margin | `0` |
| letter-spacing | `6px` — spaces out the digits nicely |

### The Footer Text Also Changes

At the very bottom of the OTP card, the helper text changes based on whether lab code is showing:

```tsx
<p style={{ color: '#4A5568', fontSize: '0.7rem', textAlign: 'center', marginTop: '1rem' }}>
  {labCode
    ? 'Code expires in 10 minutes. Enter your code above.'
    : 'Code expires in 10 minutes. Check Replit Logs for delivery.'}
</p>
```

- **Lab mode (code on card):** "Code expires in 10 minutes. Enter your code above."
- **Production (email sent):** "Code expires in 10 minutes. Check Replit Logs for delivery."

---

## Part 4: The OTP Input Component (6 Boxes)

This is the `<OtpInput>` component that renders the 6 input boxes. It is a separate component file.

### Props Interface
```typescript
interface OtpInputProps {
  onComplete: (code: string) => void;   // called when all 6 digits filled
  disabled?: boolean;                    // true while verifying
  error?: string;                        // error message to display below boxes
  reset?: number;                        // increment this to clear all boxes
}
```

### State
```typescript
const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
```

### Each Box Styling
```css
width: 48px;
height: 56px;
text-align: center;
font-size: 1.5rem;
font-weight: 700;
letter-spacing: 0;
background: rgba(255,255,255,0.06);
border: 1.5px solid rgba(99,179,237,0.3);   /* changes to #FC8181 on error */
border-radius: 10px;
color: #E2E8F0;
outline: none;
transition: border-color 200ms, box-shadow 200ms;
caret-color: #63B3ED;
```

### Focus State (applied via onFocus handler)
```css
border-color: #63B3ED;
box-shadow: 0 0 0 2px rgba(99,179,237,0.2);
```

### Blur State (applied via onBlur handler)
```css
border-color: rgba(99,179,237,0.3);    /* or #FC8181 if error */
box-shadow: none;
```

### Key Behaviors
1. **Single digit entry:** Each box accepts one digit. Typing a digit auto-advances focus to the next box.
2. **Backspace:** If box is empty and user presses Backspace, move focus to previous box and clear it.
3. **Paste:** User can paste a 6-digit code — it distributes across all boxes automatically.
4. **Auto-submit:** When the 6th digit is entered (by typing or paste), `onComplete(code)` fires immediately.
5. **Reset:** When the parent increments the `reset` prop, all boxes clear and focus returns to box 0.
6. **Disabled:** When `disabled=true`, all boxes become semi-transparent (`opacity: 0.5`) and unclickable.

### HTML Attributes Per Box
```html
<input
  type="text"
  inputMode="numeric"
  maxLength="6"
  autoComplete="one-time-code"
  data-testid="otp-digit-0"    <!-- through otp-digit-5 -->
/>
```

### Error Text Below Boxes
```tsx
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
```

---

## Part 5: Complete Flow — Start to Finish

Here is every step from the moment the user clicks "Sign In" to the moment they land on the dashboard.

### Step 1 — User Fills in Email and Password
- User is on the Sign In card (screen state = `"form"`)
- User types email and password
- User clicks "Sign In" button

### Step 2 — Frontend Calls POST /auth/login
```
POST /auth/login
Body: { "email": "user@example.com", "password": "UserPass1!" }
```

### Step 3 — Backend Responds with lab_code
```json
{
  "requiresMfa": true,
  "maskedEmail": "u****@example.com",
  "pendingToken": "eyJhbGci...",
  "lab_code": "482716"
}
```

### Step 4 — Frontend Stores State and Switches Screen
```typescript
setPendingToken("eyJhbGci...");
setMaskedEmail("u****@example.com");
setLabCode("482716");
setScreen("otp");              // card flips to OTP view
```

### Step 5 — OTP Card Renders
The card now shows:
- "Verify Your Identity" title
- "A 6-digit code was sent to: u****@example.com"
- 6 empty input boxes
- **Lab Mode box showing "482716"** (because `labCode` is truthy)

### Step 6 — User Reads Code and Types It
User sees "482716" on the card, types it into the 6 boxes. As soon as the 6th digit is entered, `onComplete("482716")` fires.

### Step 7 — Frontend Calls POST /auth/verify-otp
```
POST /auth/verify-otp
Body: { "pendingToken": "eyJhbGci...", "otp_code": "482716" }
```

### Step 8 — Backend Validates and Returns Auth Token
```json
{
  "token": "eyJhbGci... (full JWT)",
  "user": {
    "email": "user@example.com",
    "role": "owner",
    "tenant_id": "alpha-8-x9k2m1",
    "org_name": "Alpha 8",
    "is_trial": true,
    "is_parent": true,
    "trial_expires_at": "2026-03-16T..."
  }
}
```

### Step 9 — Frontend Stores Auth and Redirects
```typescript
storeAuth(data.token, data.user);   // saves to localStorage
setFadeOut(true);                    // triggers 300ms fade animation
setTimeout(() => {
  window.location.href = "/";       // redirect to dashboard
}, 300);
```

### Step 10 — User Lands on Dashboard
Done. The user is authenticated and viewing their dashboard.

---

## Part 6: Data Test IDs Reference

| Element | data-testid |
|---------|-------------|
| OTP screen container | `otp-screen` |
| Title "Verify Your Identity" | `text-otp-title` |
| Masked email display | `text-masked-email` |
| OTP input container (wrapper) | `otp-input-container` |
| Individual digit boxes | `otp-digit-0` through `otp-digit-5` |
| OTP error message | `otp-error` |
| Lab code display container | `lab-code-display` |
| Lab code value text | `text-lab-code` |
| "Verifying..." text | `text-verifying` |
| Resend success message | `text-resend-success` |
| Resend Code button | `button-resend` |
| Back to login link | `link-back-to-login` |

---

## Checklist for Your Implementation

- [ ] Backend: Check for 4 SES environment variables using `hasSes`
- [ ] Backend: Add `...(!hasSes && { lab_code: code })` to login response
- [ ] Backend: Add `...(!hasSes && { lab_code: code })` to register response
- [ ] Backend: Add `...(!hasSes && { lab_code: code })` to resend-otp response
- [ ] Frontend: Add `const [labCode, setLabCode] = useState("")` state
- [ ] Frontend: Capture `data.lab_code || ''` in sign-in handler
- [ ] Frontend: Capture `data.lab_code || ''` in register handler
- [ ] Frontend: Capture `data.lab_code` in resend handler
- [ ] Frontend: Clear `labCode` when user clicks "Back to login"
- [ ] Frontend: Render the lab code box with `{labCode && ( ... )}`
- [ ] Frontend: Style the container with blue-tinted background and border
- [ ] Frontend: Style the label as uppercase, small, muted color
- [ ] Frontend: Style the code as large, bold, monospace, blue, letter-spaced
- [ ] Frontend: Change footer text based on whether labCode is present
- [ ] Frontend: OTP input is 6 separate boxes, not one long input field
- [ ] Frontend: Each box is 48x56px with 8px gap between them
- [ ] Frontend: Auto-advance focus on digit entry
- [ ] Frontend: Auto-submit when 6th digit is entered
- [ ] Frontend: Support paste of full 6-digit code
- [ ] Frontend: Backspace moves to previous box
- [ ] Frontend: Boxes clear when `reset` counter increments (after resend or error)
