import { NextResponse } from 'next/server';
import { getActiveIntakePeriod } from '../../../../lib/transferIntakePeriods.server';
import { projectionFor } from '../../../../lib/intakeProjection.mjs';

// Public — the Transfer Request (Interest) form reads the currently open
// intake period from here instead of letting applicants pick one.
export async function GET() {
  try {
    const period = await getActiveIntakePeriod();
    return NextResponse.json({ label: period?.label || null, projection: projectionFor(period) });
  } catch {
    return NextResponse.json({ label: null, projection: null });
  }
}
