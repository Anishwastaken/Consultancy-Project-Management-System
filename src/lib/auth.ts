// Shared by the sign-in screen (instant feedback) and the server (enforcement).

export const INSTITUTE_DOMAIN = 'lnmiit.ac.in'

/** Only institutional accounts may sign in: the address must end in @lnmiit.ac.in. */
export function isInstituteEmail(email: string) {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  return at > 0 && e.slice(at + 1) === INSTITUTE_DOMAIN && /^[a-z0-9._%+-]+$/.test(e.slice(0, at))
}

export const DOMAIN_ERROR = `Use your LNMIIT email address ending in @${INSTITUTE_DOMAIN}.`

export const OTP_LENGTH = 6
