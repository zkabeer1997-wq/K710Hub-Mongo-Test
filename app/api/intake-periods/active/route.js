import { NextResponse } from 'next/server';
import { getActiveIntakePeriod } from '../../../../lib/transferIntakePeriods.server';

// Public — the Transfer Request (Interest) form reads the currently open
// intake period from here instead of letting applicants pick one.
export async function GET() {
  try {
    const period = await getActiveIntakePeriod();
    return NextResponse.json({ label: period?.label || null });
  } catch {
    return NextResponse.json({ label: null });
  }
}
