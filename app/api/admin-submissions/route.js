import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { mergePowerProfilesIntoRows } from '../../../lib/powerProfiles.mjs';

const ADMIN_COLUMNS = [
'name',
'member_id',
'infantry_tier',
'infantry_tg',
'cavalry_tier',
'cavalry_tg',
'archer_tier',
'archer_tg',
'heroes',
'availability',
  'current_alliance',
'updated_at',
].join(',');

const POWER_COLUMNS = [
'member_id',
'name',
'governor_gear',
'charms',
'hero_gear',
'pet_power',
'masters_power',
'mystic_trial_score',
'infantry_tier',
'infantry_tg',
'cavalry_tier',
'cavalry_tg',
'archer_tier',
'archer_tg',
'heroes',
'updated_at',
].join(',');

function isMissingPowerProfilesTable(error) {
return error && (
error.code === '42P01' || String(error.message || '').toLowerCase().includes('power_profiles')
);
}

export async function GET(request) {
if (!(await isAdminRequest(request))) {
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
try {
const supabase = createAdminSupabaseClient();
const { data, error } = await supabase
.from('submissions')
.select(ADMIN_COLUMNS)
.order('updated_at', { ascending: false });
if (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
const { data: powerProfiles, error: powerError } = await supabase
.from('power_profiles')
.select(POWER_COLUMNS);
if (powerError && !isMissingPowerProfilesTable(powerError)) {
return NextResponse.json({ error: powerError.message }, { status: 500 });
}
return NextResponse.json({
rows: mergePowerProfilesIntoRows(data || [], powerProfiles || []),
powerProfilesConfigured: !powerError,
});
} catch (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
}

export async function DELETE(request) {
if (!(await isAdminRequest(request))) {
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
const url = new URL(request.url);
const scope = url.searchParams.get('scope');
if (scope !== 'test') {
return NextResponse.json({ error: 'Unsupported delete scope' }, { status: 400 });
}
try {
const supabase = createAdminSupabaseClient();
const { data: candidates, error: selectError } = await supabase
.from('submissions')
.select('member_id,name');
if (selectError) {
return NextResponse.json({ error: selectError.message }, { status: 500 });
}
const deletedMemberIds = (candidates || [])
.filter((row) => {
const memberId = String(row.member_id || '');
const name = String(row.name || '');
return memberId.startsWith('TEST710') || name.startsWith('Test Seed');
})
.map((row) => String(row.member_id));
if (deletedMemberIds.length === 0) {
return NextResponse.json({ deletedMemberIds: [] });
}
const { error: deleteError } = await supabase
.from('submissions')
.delete()
.in('member_id', deletedMemberIds);
if (deleteError) {
return NextResponse.json({ error: deleteError.message }, { status: 500 });
}
await supabase
.from('power_profiles')
.delete()
.in('member_id', deletedMemberIds);
return NextResponse.json({ deletedMemberIds });
} catch (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let payload;
  try {
    payload = await request.json();
  } catch (parseError) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const name = String(payload && payload.name ? payload.name : '').trim();
  const memberId = String(payload && payload.member_id ? payload.member_id : '').trim();
  if (!name || !memberId) {
    return NextResponse.json({ error: 'Name and Member ID are required.' }, { status: 400 });
  }
  const pick = (key) => (payload && payload[key] !== undefined && payload[key] !== '' ? payload[key] : null);
  const record = {
    name,
    member_id: memberId,
    infantry_tier: pick('infantry_tier'),
    infantry_tg: pick('infantry_tg'),
    cavalry_tier: pick('cavalry_tier'),
    cavalry_tg: pick('cavalry_tg'),
    archer_tier: pick('archer_tier'),
    archer_tg: pick('archer_tg'),
    heroes: Array.isArray(payload && payload.heroes) ? payload.heroes : [],
    availability: pick('availability'),
    current_alliance: pick('current_alliance'),
    pin_hash: 'admin-' + Math.random().toString(36).slice(2) + Date.now().toString(36),
    updated_at: new Date().toISOString(),
  };
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
    .from('submissions')
    .insert(record)
    .select(ADMIN_COLUMNS)
    .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const [row] = mergePowerProfilesIntoRows([data], []);
    return NextResponse.json({ row });
  } catch (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
}
