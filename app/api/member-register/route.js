import { NextResponse } from 'next/server';

/**
 * Legacy Member ID + PIN registration is retired on the Mongo / Kingshot stack.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: 'PIN registration is no longer available. Use Kingshot Player ID login on the Members page.',
      code: 'PIN_REGISTER_RETIRED',
      loginPath: '/player-record',
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: 'PIN registration is no longer available. Use Kingshot Player ID login on the Members page.',
      code: 'PIN_REGISTER_RETIRED',
      loginPath: '/player-record',
    },
    { status: 410 }
  );
}
