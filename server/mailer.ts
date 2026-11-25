// Sends the sign-in code by e-mail through the SMTP server configured in .env.
//
// Without SMTP settings the server runs in development mode: the code is
// printed in this terminal instead, and the sign-in screen says so. Nothing
// claims an e-mail was sent when it wasn't.

import nodemailer, { type Transporter } from 'nodemailer'

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, OTP_REDIRECT_TO } = process.env

export const mailConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)

let transporter: Transporter | null = null
if (mailConfigured) {
  const port = Number(SMTP_PORT ?? 465)
  transporter = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
}

export type Delivery = 'email' | 'console'

export function describeMailSetup() {
  if (!mailConfigured) return 'e-mail not configured: sign-in codes are printed here (development mode)'
  return `sending sign-in codes via ${SMTP_HOST}${OTP_REDIRECT_TO ? ` (all codes redirected to ${OTP_REDIRECT_TO})` : ''}`
}

/** Where a code for `email` will actually go. */
export const destinationFor = (email: string) => (mailConfigured && OTP_REDIRECT_TO ? OTP_REDIRECT_TO : email)

export async function sendOtp(email: string, name: string, code: string, minutes: number): Promise<Delivery> {
  if (!transporter) {
    console.log(`[otp] Code for ${email}: ${code}  (valid ${minutes} min; e-mail not configured)`)
    return 'console'
  }
  const to = destinationFor(email)
  const redirected = to !== email
  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject: `${code} is your CPTS sign-in code`,
    text: [
      `Hello ${name},`,
      '',
      `Your CPTS sign-in code is ${code}. It expires in ${minutes} minutes.`,
      redirected ? `(Demo redirect: this code is for the account ${email}.)` : '',
      '',
      'If you did not try to sign in, ignore this e-mail; your password is still required.',
      '',
      'CPTS, Consultancy Project Tracking System, LNMIIT',
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;color:#172030;max-width:480px">
      <p>Hello ${escapeHtml(name)},</p>
      <p>Your CPTS sign-in code is</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
      <p>It expires in ${minutes} minutes.${redirected ? `<br><span style="color:#737d8c">Demo redirect: this code is for the account ${escapeHtml(email)}.</span>` : ''}</p>
      <p style="color:#737d8c;font-size:13px">If you did not try to sign in, ignore this e-mail; your password is still required.</p>
      <p style="color:#737d8c;font-size:13px">CPTS, Consultancy Project Tracking System, LNMIIT</p>
    </div>`,
  })
  console.log(`[otp] Code for ${email} e-mailed to ${to}`)
  return 'email'
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
