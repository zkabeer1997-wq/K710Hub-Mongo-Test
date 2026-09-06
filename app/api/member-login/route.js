import { NextResponse } from 'next/server';

/**
 * Legacy Member ID + PIN login is retired on the Mongo / Kingshot stack.
 * Members must use the Kingshot Player ID flow at /player-record (or /login).
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'PIN login is no longer available. Use Kingshot Player ID login on the Members page.',
      code: 'PIN_LOGIN_RETIRED',
      loginPath: '/player-record',
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'PIN login is no longer available. Use Kingshot Player ID login on the Members page.',
      code: 'PIN_LOGIN_RETIRED',
      loginPath: '/player-record',
    },
    { status: 410 }
  );
}
