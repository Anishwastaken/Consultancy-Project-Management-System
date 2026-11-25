// Shared by the sign-in screen (instant feedback) and the server (enforcement).

import type { RoleId } from '../data/types'

export const INSTITUTE_DOMAIN = 'lnmiit.ac.in'

/** Only institutional accounts may sign in: the address must end in @lnmiit.ac.in. */
export function isInstituteEmail(email: string) {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  return at > 0 && e.slice(at + 1) === INSTITUTE_DOMAIN && /^[a-z0-9._%+-]+$/.test(e.slice(0, at))
}

export const DOMAIN_ERROR = `Use your LNMIIT email address ending in @${INSTITUTE_DOMAIN}.`

export const OTP_LENGTH = 6

/* Self sign-up. Administrator accounts can't be requested; an administrator
   activates every new account and can change its role. */

export const SIGNUP_ROLES: RoleId[] = ['faculty', 'approver', 'finance', 'management']
export const PASSWORD_MIN = 8

export interface SignupInput {
  name: string
  email: string
  department: string
  title: string
  roleId: RoleId
  password: string
}

export function signupErrors(i: SignupInput): Partial<Record<keyof SignupInput, string>> {
  const e: Partial<Record<keyof SignupInput, string>> = {}
  if (!i.name.trim()) e.name = 'Enter your full name.'
  else if (i.name.trim().length > 100) e.name = 'Keep the name under 100 characters.'
  if (!isInstituteEmail(i.email)) e.email = DOMAIN_ERROR
  else if (i.email.trim().length > 120) e.email = 'This email address is too long.'
  if (!i.department.trim()) e.department = 'Enter your department.'
  else if (i.department.trim().length > 100) e.department = 'Keep the department under 100 characters.'
  if (i.title.trim().length > 100) e.title = 'Keep the designation under 100 characters.'
  if (!SIGNUP_ROLES.includes(i.roleId)) e.roleId = 'Choose a role.'
  if (i.password.length < PASSWORD_MIN) e.password = `Use at least ${PASSWORD_MIN} characters.`
  else if (i.password.length > 200) e.password = 'Use at most 200 characters.'
  return e
}
