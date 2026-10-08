import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { memberNobleAppointment } from '../../../lib/nobleAppointment.server.js';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'private, no-store' };

// GET -> the signed-in member's Noble Advisor time for the current Flamedragon cycle. The grid
// (`schedule`, names only, never ids) is returned only once leadership has published it.
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401, headers: HEADERS });
  try {
    return NextResponse.json(await memberNobleAppointment(session.memberId), { headers: HEADERS });
  } catch (error) {
    console.error('noble-appointment failed', error);
    return NextResponse.json({ error: 'Could not load your appointment. Please try again.' }, { status: 500, headers: HEADERS });
  }
}
