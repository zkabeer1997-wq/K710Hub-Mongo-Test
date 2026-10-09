import { NextResponse } from 'next/server';
import {
  APPLICANT_COOKIE_NAME,
  APPLICANT_FLOW_COOKIE_NAME,
  applicantCookieOptions,
} from '../../../../lib/applicantAuth.js';

// Clears the applicant cookies only. The member cookie is never touched.
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(APPLICANT_COOKIE_NAME, '', applicantCookieOptions(0));
  response.cookies.set(APPLICANT_FLOW_COOKIE_NAME, '', applicantCookieOptions(0));
  return response;
}
