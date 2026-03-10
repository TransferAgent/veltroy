# Login Workflow — Complete Build Card

This document provides the exact specifications for recreating the Veltroy NDR login experience. It covers two cards (screens): the **Sign In Card** and the **Verify Your Identity (OTP) Card**, plus the animated background, the Lab Mode code display, and the full API workflow.

---

## Table of Contents

1. [Full-Page Background](#1-full-page-background)
2. [Card 1 — Sign In](#2-card-1--sign-in)
3. [Card 2 — Verify Your Identity (OTP)](#3-card-2--verify-your-identity-otp)
4. [OTP Input — 6-Block Component](#4-otp-input--6-block-component)
5. [Lab Mode Code Display](#5-lab-mode-code-display)
6. [API Workflow — Step by Step](#6-api-workflow--step-by-step)
7. [State Machine](#7-state-machine)
8. [Data Test IDs](#8-data-test-ids)

---

## 1. Full-Page Background

The background sits behind both cards. It is a fixed full-viewport layer.

### Background Gradient
```
linear-gradient(135deg, #0a0f1a 0%, #0d1b2a 50%, #0a1628 100%)
```

### Decorative Dashboard Tiles (behind the card)
- A 3-column CSS grid of 6 tiles, blurred and faded behind the login card
- `opacity: 0.15`, `filter: blur(3px)`, `transform: scale(1.05)`
- Each tile: `background: rgba(255,255,255,0.05)`, `border: 1px solid rgba(99,179,237,0.2)`, `border-radius: 8px`, `padding: 1rem`
- Tile text color: `#E2E8F0`, font-size: `0.85rem`
- Tile metric numbers: `font-size: 1.4rem`, `font-weight: 700`, `color: #63B3ED`
- Status dot colors: Green `#48BB78`, Orange `#F6AD55`, Blue `#63B3ED`, Purple `#9F7AEA`

### Dark Overlay (on top of tiles, behind card)
```
background: rgba(5,10,20,0.65)
z-index: 1
```

---

## 2. Card 1 — Sign In

This is the first card the user sees. It has two tabs: "Sign In" and "Get Started" (registration). This section covers the Sign In tab only (not the trial registration form).

### Card Container (shared by both screens)
```css
position: fixed;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
width: 420px;
max-width: 92vw;
background: rgba(13, 20, 35, 0.90);
border: 1px solid rgba(99, 179, 237, 0.25);
border-radius: 16px;
box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,179,237,0.1);
backdrop-filter: blur(20px);
z-index: 10;
padding: 2rem;
```

### Fade-Out Transition (on successful auth)
```css
opacity: 0;
transform: translate(-50%, -50%) scale(0.95);
transition: opacity 300ms ease, transform 300ms ease;
```

### Card Header
- Shield emoji: `🛡️` at `font-size: 28px`, `color: #63B3ED`
- Title: **"NDR PLATFORM"** (or your brand name)
  - `color: #fff`, `font-size: 22px`, `font-weight: 700`
- Subtitle: "Enterprise Network Detection & Response"
  - `color: #718096`, `font-size: 13px`

### Tab Switcher
```css
display: flex;
gap: 4px;
background: rgba(255,255,255,0.04);
border-radius: 8px;
padding: 3px;
margin-bottom: 1.5rem;
```

Each tab button:
```css
flex: 1;
padding: 8px 0;
border: none;
border-radius: 6px;
font-size: 0.85rem;
font-weight: 600;
cursor: pointer;
transition: all 200ms ease;
```

**Sign In tab (active):**
```css
background: rgba(99,179,237,0.15);
color: #63B3ED;
```

**Sign In tab (inactive):**
```css
background: transparent;
color: #718096;
```

**Get Started tab (active):**
```css
background: rgba(72,187,120,0.15);
color: #48BB78;
```

### Labels
```css
display: block;
color: #A0AEC0;
font-size: 0.8rem;
margin-bottom: 6px;
font-weight: 500;
```

### Input Fields
```css
width: 100%;
padding: 10px 14px;
background: rgba(255,255,255,0.06);
border: 1px solid rgba(99,179,237,0.2);
border-radius: 8px;
color: #E2E8F0;
font-size: 0.9rem;
outline: none;
box-sizing: border-box;
```

- Email placeholder: `"your@company.com"`
- Password placeholder: `"Password"`

### Sign In Button
```css
width: 100%;
padding: 11px;
background: #2B6CB0;
color: #fff;
border: none;
border-radius: 8px;
font-size: 0.9rem;
font-weight: 600;
cursor: pointer;
transition: background 200ms;
```
- Hover: `background: #2C5282`
- Loading state: `background: #2C5282`, `cursor: not-allowed`
- Loading text: `"Signing in..."`

### Error Message
```css
color: #FC8181;
font-size: 0.8rem;
margin-top: 12px;
text-align: center;
```

### Footer Link
- Text: `"No account?"` in `color: #718096`, `font-size: 0.8rem`
- Link text: `"Start your free 6-day trial"` in `color: #48BB78`, `font-weight: 500`, `cursor: pointer`

---

## 3. Card 2 — Verify Your Identity (OTP)

This card appears after successful email/password submission. Same card container styles as Card 1.

### Header
- Shield emoji: `🛡️` at `font-size: 28px`, `color: #63B3ED`
- Title: **"Verify Your Identity"**
  - `color: #fff`, `font-size: 22px`, `font-weight: 700`
- Instruction text: `"A 6-digit code was sent to:"`
  - `color: #A0AEC0`, `font-size: 13px`
- Masked email (e.g. `s****@ndr-platform.io`):
  - `color: #63B3ED`, `font-weight: bold`, `font-size: 14px`

### OTP Input Section
See [Section 4](#4-otp-input--6-block-component) below for the full 6-block specification.

### "Verifying..." Loading Text
```css
color: #63B3ED;
font-size: 0.85rem;
text-align: center;
margin: 0 0 12px 0;
```

### Lab Mode Code Display
See [Section 5](#5-lab-mode-code-display) below for the full specification.

### Resend Success Message
```css
color: #48BB78;
font-size: 0.8rem;
text-align: center;
margin: 0 0 12px 0;
```

### "Didn't receive a code?" Section
- Label: `color: #718096`, `font-size: 0.8rem`
- **Resend Code button:**
```css
background: none;
border: 1px solid rgba(99,179,237,0.3);
border-radius: 8px;
color: #63B3ED;
padding: 8px 20px;
font-size: 0.8rem;
font-weight: 600;
cursor: pointer;
transition: all 200ms;
```
- Hover: `background: rgba(99,179,237,0.1)`

### "Back to login" Link
```css
color: #718096;
font-size: 0.8rem;
cursor: pointer;
```
- Text: `"← Back to login"`
- Clicking clears all OTP state and returns to Sign In card

### Footer Expiry Note
```css
color: #4A5568;
font-size: 0.7rem;
text-align: center;
margin-top: 1rem;
```
- If lab code visible: `"Code expires in 10 minutes. Enter your code above."`
- If no lab code: `"Code expires in 10 minutes. Check Replit Logs for delivery."`

---

## 4. OTP Input — 6-Block Component

Six individual input boxes arranged in a horizontal row.

### Container Layout
```css
display: flex;
gap: 8px;
justify-content: center;
margin-bottom: 1.5rem;    /* from parent */
```

### Each Input Box
```css
width: 48px;
height: 56px;
text-align: center;
font-size: 1.5rem;
font-weight: 700;
letter-spacing: 0;
background: rgba(255,255,255,0.06);
border: 1.5px solid rgba(99,179,237,0.3);
border-radius: 10px;
color: #E2E8F0;
outline: none;
transition: border-color 200ms, box-shadow 200ms;
caret-color: #63B3ED;
```

### Focus State
```css
border-color: #63B3ED;
box-shadow: 0 0 0 2px rgba(99,179,237,0.2);
```

### Error State
```css
border: 1.5px solid #FC8181;
```

### Disabled State
```css
opacity: 0.5;
cursor: not-allowed;
```

### Behavior
- `type="text"`, `inputMode="numeric"`, `maxLength=6`
- Single digit per box — typing a digit auto-advances focus to next box
- Backspace on empty box moves focus to previous box and clears it
- Paste support: pastes up to 6 digits, distributes across all boxes
- When all 6 digits filled, auto-submits by calling `onComplete(code)`
- `autoComplete="one-time-code"` for mobile autofill support

### Error Text (below boxes)
```css
color: #FC8181;
font-size: 0.8rem;
text-align: center;
margin-top: 8px;
```

---

## 5. Lab Mode Code Display

When SES (email service) is not configured, the API returns a `lab_code` field. This code is displayed directly on the OTP card so the user doesn't need to check logs.

### Condition
Only rendered when `labCode` is a non-empty string (returned from login, register, or resend API responses).

### Container
```css
background: rgba(99,179,237,0.08);
border: 1px solid rgba(99,179,237,0.25);
border-radius: 8px;
padding: 10px 16px;
margin: 0 0 12px 0;
text-align: center;
```

### Label Text
```
"Lab Mode — Your Code"
```
```css
color: #A0AEC0;
font-size: 0.7rem;
margin: 0 0 4px 0;
text-transform: uppercase;
letter-spacing: 1px;
```

### Code Display
```css
color: #63B3ED;
font-size: 1.5rem;
font-weight: 700;
font-family: monospace;
margin: 0;
letter-spacing: 6px;
```

### Wiring
The `lab_code` field comes from three API responses:
1. `POST /auth/login` → `response.lab_code` (when `requiresMfa: true`)
2. `POST /auth/register` → `response.lab_code` (when `requiresMfa: true`)
3. `POST /auth/resend-otp` → `response.lab_code`

The code is stored in React state (`labCode`) and updated on each of these responses. When `resend-otp` is called, the new `lab_code` replaces the old one.

---

## 6. API Workflow — Step by Step

### Step 1: User Submits Sign In Form

**Request:**
```
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "UserPass1!"
}
```

**Success Response (200):**
```json
{
  "requiresMfa": true,
  "pendingToken": "<JWT string>",
  "maskedEmail": "u****@example.com",
  "lab_code": "482716"
}
```
- `lab_code` only present when SES is NOT configured (lab mode)
- `pendingToken` is a short-lived JWT (15 min expiry) that identifies this auth session

**Error Responses:**
- `401`: `{"error": "Invalid email or password"}`
- `402`: `{"error": "Your trial has expired"}`
- `500`: `{"error": "Login failed"}`

### Step 2: UI Transitions to OTP Screen

On receiving `requiresMfa: true`:
1. Store `pendingToken` in state
2. Store `maskedEmail` in state
3. Store `lab_code` in state (if present)
4. Switch screen from `"form"` to `"otp"`

### Step 3: User Enters 6-Digit Code

The OTP input auto-submits when all 6 digits are filled.

**Request:**
```
POST /auth/verify-otp
Content-Type: application/json

{
  "pendingToken": "<JWT from step 1>",
  "otp_code": "482716"
}
```

**Success Response (200):**
```json
{
  "token": "<full auth JWT>",
  "user": {
    "email": "user@example.com",
    "role": "owner",
    "tenant_id": "acme-security-a1b2c3",
    "org_name": "Acme Security",
    "is_trial": true,
    "is_parent": true,
    "trial_expires_at": "2026-03-16T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: `{"error": "Invalid or expired code"}`
- `401`: `{"error": "Invalid or expired session"}`

### Step 4: Auth Storage & Redirect

On success:
1. Store `token` and `user` in localStorage:
   - Key `ndr_token` → JWT string
   - Key `ndr_user` → JSON stringified user object
2. Trigger fade-out animation (300ms)
3. Redirect to `"/"` (dashboard)

### Step 5 (Optional): Resend Code

If the user didn't receive the code or it expired:

**Request:**
```
POST /auth/resend-otp
Content-Type: application/json

{
  "pendingToken": "<JWT from step 1>"
}
```

**Success Response (200):**
```json
{
  "message": "New code sent. Check Replit Logs.",
  "maskedEmail": "u****@example.com",
  "lab_code": "593827"
}
```
- New `lab_code` replaces the old one in UI state
- OTP input boxes are cleared (reset)

**Rate Limited (429):**
```json
{
  "error": "Please wait before requesting a new code.",
  "retry_after": 60
}
```

---

## 7. State Machine

```
[Sign In Form] ──submit──> POST /auth/login
     │                           │
     │                    requiresMfa: true
     │                           │
     │                           ▼
     │                    [OTP Screen]
     │                     │        │
     │              enter code    resend
     │                     │        │
     │                     ▼        ▼
     │            POST /verify  POST /resend
     │                     │        │
     │              success │    new lab_code
     │                     │    clear inputs
     │                     ▼
     │               [Store Auth]
     │                     │
     │              fade out 300ms
     │                     │
     │                     ▼
     │              [Redirect to /]
     │
     ◄────── "← Back to login" ──────┘
```

---

## 8. Data Test IDs

### Sign In Card
| Element | data-testid |
|---------|-------------|
| Login title | `text-login-title` |
| Sign In tab | `button-tab-signin` |
| Get Started tab | `button-tab-register` |
| Email input | `input-login-email` |
| Password input | `input-login-password` |
| Sign In button | `button-signin` |
| Error message | `text-login-error` |
| "Start trial" link | `link-to-register` |

### OTP Card
| Element | data-testid |
|---------|-------------|
| OTP screen container | `otp-screen` |
| OTP title | `text-otp-title` |
| Masked email | `text-masked-email` |
| OTP input container | `otp-input-container` |
| Individual digit boxes | `otp-digit-0` through `otp-digit-5` |
| OTP error text | `otp-error` |
| Lab code display box | `lab-code-display` |
| Lab code value | `text-lab-code` |
| Verifying text | `text-verifying` |
| Resend success | `text-resend-success` |
| Resend button | `button-resend` |
| Back to login link | `link-back-to-login` |

---

## Color Reference (Quick Lookup)

| Token | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#63B3ED` | Accent text, links, focused borders, caret, lab code |
| Primary Blue (rgba) | `rgba(99,179,237,*)` | Border tints, glows, backgrounds at various opacities |
| Dark Blue Button | `#2B6CB0` | Sign In button background |
| Dark Blue Hover | `#2C5282` | Sign In button hover/loading |
| Green | `#48BB78` | Get Started tab, trial link, resend success text |
| Green Button | `#276749` | Register button (Get Started tab) |
| Green Button Hover | `#22543D` | Register button hover |
| Card BG | `rgba(13,20,35,0.90)` | Card background with backdrop blur |
| Input BG | `rgba(255,255,255,0.06)` | Input fields and OTP boxes |
| Text White | `#fff` | Titles |
| Text Light | `#E2E8F0` | Input text, OTP digit text |
| Text Muted | `#A0AEC0` | Labels, instruction text, lab mode label |
| Text Gray | `#718096` | Subtitles, tab inactive, helper text |
| Text Dark Gray | `#4A5568` | Footer notes |
| Error Red | `#FC8181` | Error messages, error border on OTP boxes |
| Page BG Dark 1 | `#0a0f1a` | Gradient start |
| Page BG Dark 2 | `#0d1b2a` | Gradient mid |
| Page BG Dark 3 | `#0a1628` | Gradient end |
| Overlay | `rgba(5,10,20,0.65)` | Dark scrim over background tiles |

## Font Reference

| Context | Size | Weight | Family |
|---------|------|--------|--------|
| Card title | 22px | 700 | System default (sans-serif) |
| Tab buttons | 0.85rem | 600 | System default |
| Labels | 0.8rem | 500 | System default |
| Input text | 0.9rem | 400 | System default |
| Button text | 0.9rem | 600 | System default |
| OTP digits | 1.5rem | 700 | System default |
| Lab code value | 1.5rem | 700 | `monospace` |
| Lab code label | 0.7rem | 400 | System default |
| Helper/footer text | 0.7–0.8rem | 400–500 | System default |
| Masked email | 14px | bold | System default |
| Instruction text | 13px | 400 | System default |
