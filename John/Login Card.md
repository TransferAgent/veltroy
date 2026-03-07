# Login Card — Visual Specification

This document describes the login card used on the NDR Platform so it can be replicated on another Replit project. There are three card states: Sign In, Get Started (Register), and OTP Verification. All three use the same card container and background.

---

## 1. Full-Page Background

The login card floats over a full-screen atmospheric background. The background has two layers:

### Layer 1: Gradient Base

- Fills the entire viewport (`position: fixed`, `inset: 0`)
- Three-stop diagonal gradient at 135 degrees:
  - `#0a0f1a` at 0% (near-black navy)
  - `#0d1b2a` at 50% (dark navy blue)
  - `#0a1628` at 100% (deep midnight)

### Layer 2: Blurred Dashboard Tiles

- A 3-column CSS grid of six small "preview" tiles sits on top of the gradient
- The tiles simulate a dashboard with colored status dots and metric values
- The entire grid is set to 15% opacity and 3px blur, scaled to 105%
- A dark overlay (`rgba(5,10,20,0.65)`) sits on top to further dim the tiles
- This creates a frosted-glass impression of a live dashboard behind the login card
- The tiles are non-interactive (pointer-events: none)

### Tile Details (for reference, not required to replicate exactly)

Each tile has:
- Background: `rgba(255,255,255,0.05)`
- Border: `1px solid rgba(99,179,237,0.2)`
- Border radius: 8px
- Padding: 1rem
- Text color: `#E2E8F0`
- Font size: 0.85rem
- A small colored dot (8x8px circle) before the label
- A large metric value below (1.4rem, bold, color `#63B3ED`)

---

## 2. Card Container (Shared Across All Three States)

The same card container is used for Sign In, Register, and OTP screens.

| Property | Value |
|----------|-------|
| Position | Fixed, dead center of the viewport (`top: 50%`, `left: 50%`, `transform: translate(-50%, -50%)`) |
| Width | 420px |
| Max Width | 92vw (responsive on mobile) |
| Background | `rgba(13, 20, 35, 0.90)` — near-black navy at 90% opacity |
| Border | `1px solid rgba(99, 179, 237, 0.25)` — faint blue border |
| Border Radius | 16px |
| Box Shadow | Two shadows layered: `0 25px 60px rgba(0,0,0,0.6)` (large drop shadow) and `0 0 0 1px rgba(99,179,237,0.1)` (subtle blue outline) |
| Backdrop Filter | `blur(20px)` — blurs the background tiles behind the card |
| Padding | 2rem (32px) on all sides |
| Z-Index | 10 |

### Fade-Out Animation (on successful login)

When the user successfully verifies, the card fades out before redirecting:
- Opacity transitions from 1 to 0 over 300ms ease
- Scale transitions from 1.0 to 0.95 over 300ms ease
- After 300ms, `window.location.href` redirects to the dashboard

---

## 3. Card Header (Same for Sign In and Register)

Centered at the top of the card, above the tab switcher.

| Element | Style |
|---------|-------|
| Icon | Shield emoji at 28px font size, colored `#63B3ED` (light blue) |
| Title | "NDR PLATFORM" — white (`#fff`), 22px, font-weight 700, 4px margin above and below |
| Subtitle | "Enterprise Network Detection & Response" — gray (`#718096`), 13px, no margin |
| Section margin-bottom | 1.5rem below the header block |

---

## 4. Tab Switcher (Sign In / Get Started)

A pill-style toggle bar sitting between the header and the form fields.

| Property | Value |
|----------|-------|
| Container background | `rgba(255,255,255,0.04)` |
| Container border radius | 8px |
| Container padding | 3px |
| Container layout | Flexbox, gap 4px |
| Container margin-bottom | 1.5rem |
| Each tab | `flex: 1` (equal width), padding 8px vertical, border-radius 6px |
| Tab font | 0.85rem, font-weight 600 |
| Tab transition | `all 200ms ease` |

### Active States

| Tab | Active Background | Active Text | Inactive Text |
|-----|-------------------|-------------|---------------|
| Sign In | `rgba(99,179,237,0.15)` (blue tint) | `#63B3ED` (blue) | `#718096` (gray) |
| Get Started | `rgba(72,187,120,0.15)` (green tint) | `#48BB78` (green) | `#718096` (gray) |

---

## 5. Input Fields (Shared Style)

All text inputs across both forms use the same styling.

| Property | Value |
|----------|-------|
| Width | 100% |
| Padding | 10px horizontal, 14px vertical |
| Background | `rgba(255,255,255,0.06)` — very subtle white overlay |
| Border | `1px solid rgba(99,179,237,0.2)` — faint blue |
| Border Radius | 8px |
| Text Color | `#E2E8F0` (light gray-white) |
| Font Size | 0.9rem |
| Outline | none |
| Box Sizing | border-box |

### Labels (Above Each Input)

| Property | Value |
|----------|-------|
| Display | block |
| Color | `#A0AEC0` (medium gray) |
| Font Size | 0.8rem |
| Font Weight | 500 |
| Margin Bottom | 6px (space between label and input) |

---

## 6. Sign In Form

The Sign In form has two fields and one button.

### Fields

| Order | Label | Input Type | Placeholder |
|-------|-------|-----------|-------------|
| 1 | Email | email | "your@company.com" |
| 2 | Password | password | "Password" |

- Field 1 has `margin-bottom: 1rem` (16px)
- Field 2 has `margin-bottom: 1.25rem` (20px)

### Submit Button

| Property | Value |
|----------|-------|
| Width | 100% |
| Padding | 11px |
| Background | `#2B6CB0` (medium blue) |
| Hover Background | `#2C5282` (darker blue) |
| Loading Background | `#2C5282` (same as hover, stays dark) |
| Text Color | White |
| Border | none |
| Border Radius | 8px |
| Font Size | 0.9rem |
| Font Weight | 600 |
| Cursor | pointer (or not-allowed when loading) |
| Transition | background 200ms |
| Label | "Sign In" (normal) / "Signing in..." (loading) |

### Error Message

- Color: `#FC8181` (light red)
- Font size: 0.8rem
- Centered text
- Margin-top: 12px
- Only visible when there is an error

### Footer Text

- "No account?" in gray (`#718096`, 0.8rem)
- "Start your free 6-day trial" as a clickable span in green (`#48BB78`, font-weight 500)
- Centered, margin-top: 1.25rem
- Clicking switches to the Register tab

---

## 7. Get Started (Register) Form

The Register form has four fields and one button.

### Fields

| Order | Label | Input Type | Placeholder | Margin Below |
|-------|-------|-----------|-------------|--------------|
| 1 | Organization Name | text | "Acme Security Inc." | 0.85rem |
| 2 | Email | email | "your@company.com" | 0.85rem |
| 3 | Password | password | "Min 8 chars, 1 number, 1 special" | 0.85rem |
| 4 | Confirm Password | password | "Confirm password" | 1.25rem |

### Submit Button

| Property | Value |
|----------|-------|
| Width | 100% |
| Padding | 11px |
| Background | `#276749` (forest green) |
| Hover Background | `#22543D` (darker green) |
| Loading Background | `#22543D` |
| Text Color | White |
| Border | none |
| Border Radius | 8px |
| Font Size | 0.9rem |
| Font Weight | 600 |
| Label | "Create Account & Start Trial" (normal) / "Creating account..." (loading) |

### Error Message

Same style as Sign In error (red `#FC8181`, 0.8rem, centered).

### Footer Text (Two Lines)

1. "6-day free trial · No credit card required" — gray `#718096`, 0.75rem, centered, margin-top 10px
2. "Already have an account? **Sign In**" — gray `#718096`, 0.8rem, centered, margin-top 8px
   - "Sign In" is a clickable span in blue (`#63B3ED`, font-weight 500)

---

## 8. OTP Verification Screen (Second Card State)

After a successful credential submission, the card transitions to the OTP screen. The same card container is reused.

### Header

| Element | Style |
|---------|-------|
| Icon | Same shield emoji, 28px, `#63B3ED` |
| Title | "Verify Your Identity" — white, 22px, bold |
| Description Line 1 | "A 6-digit code was sent to:" — `#A0AEC0`, 13px |
| Description Line 2 | The masked email (e.g., `****io@ndr-platform.io`) — `#63B3ED`, 14px, bold |
| Section margin-bottom | 1.5rem |

### OTP Input Row

Six individual input boxes arranged horizontally, centered.

| Property | Value |
|----------|-------|
| Layout | Flexbox, gap 8px, justify-content center |
| Each Box Width | 48px |
| Each Box Height | 56px |
| Text Align | center |
| Font Size | 1.5rem |
| Font Weight | 700 |
| Background | `rgba(255,255,255,0.06)` |
| Border | `1.5px solid rgba(99,179,237,0.3)` (normal) or `1.5px solid #FC8181` (error) |
| Border Radius | 10px |
| Text Color | `#E2E8F0` |
| Caret Color | `#63B3ED` |
| Focus Effect | Border turns `#63B3ED`, box-shadow `0 0 0 2px rgba(99,179,237,0.2)` |
| Disabled | 50% opacity, cursor not-allowed |
| Transition | border-color 200ms, box-shadow 200ms |

### Behavior

- Typing a digit auto-advances the cursor to the next box
- Pressing Backspace on an empty box moves back and clears the previous box
- Pasting a 6-digit string fills all boxes and auto-submits
- When the 6th digit is entered, submission fires automatically (no submit button needed)

### Messages Below OTP Boxes

| Message | Color | Font Size | When Visible |
|---------|-------|-----------|--------------|
| Error text (e.g., "Invalid code.") | `#FC8181` (red) | 0.8rem | After failed verification |
| "Verifying..." | `#63B3ED` (blue) | 0.85rem | While OTP is being checked |
| "New code sent. Check Replit Logs." | `#48BB78` (green) | 0.8rem | After successful resend |

### Resend Section

- "Didn't receive a code?" — `#718096`, 0.8rem, centered
- "Resend Code" button:
  - Background: transparent (`none`)
  - Border: `1px solid rgba(99,179,237,0.3)`
  - Border radius: 8px
  - Text color: `#63B3ED`
  - Padding: 8px horizontal, 20px vertical
  - Font size: 0.8rem, weight 600
  - Hover: background changes to `rgba(99,179,237,0.1)`

### Back to Login Link

- "← Back to login" — `#718096`, 0.8rem, cursor pointer
- Centered, margin-top 1.25rem
- Clicking resets all OTP state and returns to the form screen

### Footer

- "Code expires in 10 minutes. Check Replit Logs for delivery."
- Color: `#4A5568` (dark gray)
- Font size: 0.7rem
- Centered, margin-top 1rem

---

## 9. Color Palette Summary

| Name | Hex | Usage |
|------|-----|-------|
| Near-black navy | `#0a0f1a` | Background gradient start/end |
| Dark navy | `#0d1b2a` | Background gradient middle |
| Card background | `rgba(13,20,35,0.90)` | Card panel |
| Light blue | `#63B3ED` | Accents, active Sign In tab, OTP focus, links, shield icon |
| Green | `#48BB78` | Active Register tab, success messages, trial link |
| Medium blue button | `#2B6CB0` | Sign In submit button |
| Dark blue button | `#2C5282` | Sign In button hover/loading |
| Forest green button | `#276749` | Register submit button |
| Dark green button | `#22543D` | Register button hover/loading |
| White | `#FFFFFF` / `#E2E8F0` | Headings / input text |
| Medium gray | `#A0AEC0` | Labels, descriptions |
| Gray | `#718096` | Subtitles, footer text, inactive tabs |
| Dark gray | `#4A5568` | Faint footer text |
| Red | `#FC8181` | Error messages, error borders |
| Blue border | `rgba(99,179,237,0.25)` | Card border |
| Blue border faint | `rgba(99,179,237,0.2)` | Input borders, tile borders |
| Input background | `rgba(255,255,255,0.06)` | Subtle white overlay on inputs |

---

## 10. Responsive Behavior

- Card width is fixed at 420px but capped at 92vw on small screens
- OTP boxes are 48px wide each, so the 6-box row (48 * 6 + 8 * 5 gaps = 328px) fits comfortably inside the 420px card with 32px padding on each side
- The background grid tiles don't need to be responsive — they're decorative, blurred, and clipped by overflow hidden

---

## 11. Card State Transitions

```
[Sign In Form] -- submit credentials --> [OTP Screen]
[Get Started Form] -- submit registration --> [OTP Screen]
[OTP Screen] -- verify code --> [Fade out, redirect to dashboard]
[OTP Screen] -- "Back to login" --> [Sign In Form]
[Sign In Form] <--> [Get Started Form]  (tab switcher, no server call)
```

All transitions are instant (no animation between states) except the final fade-out on successful OTP verification (300ms opacity + scale).
