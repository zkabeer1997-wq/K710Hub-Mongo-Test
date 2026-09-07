import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { readMemberSession } from '../../../lib/memberAuth';
import { publicPowerProfile, sanitizePowerProfileInput } from '../../../lib/powerProfiles.mjs';

const PUBLIC_COLUMNS = [
'member_id', 'name', 'governor_gear', 'charms', 'hero_gear', 'pet_power', 'masters_power', 'mystic_trial_score',
'infantry_tier', 'infantry_tg', 'cavalry_tier', 'cavalry_tg', 'archer_tier', 'archer_tg',
'heroes', 'updated_at',
].join(',');

function tableMissingResponse() {
return NextResponse.json({
error: 'Power profiles are not configured yet. Apply the power_profiles database migration first.',
}, { status: 500 });
}

function isMissingTableError(error) {
return error && (
error.code === '42P01' || String(error.message || '').toLowerCase().includes('power_profiles')
);
}

export async function GET(request) {
const url = new URL(request.url);
const memberId = String(url.searchParams.get('member_id') || '').trim();
if (!memberId) {
return NextResponse.json({ error: 'Member ID is required' }, { status: 400 });
}
try {
const supabase = createAdminSupabaseClient();
const { data, error } = await supabase
.from('power_profiles')
.select(PUBLIC_COLUMNS)
.eq('member_id', memberId)
.maybeSingle();
if (error) {
if (isMissingTableError(error)) return tableMissingResponse();
return NextResponse.json({ error: error.message }, { status: 500 });
}
return NextResponse.json({ profile: publicPowerProfile(data) });
} catch (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
}

export async function POST(request) {
const session = await readMemberSession(request);
if (!session) {
return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
}
let profile;
try {
profile = sanitizePowerProfileInput(await request.json());
} catch (error) {
return NextResponse.json({ error: error.message }, { status: 400 });
}
if (profile.member_id !== session.memberId) {
return NextResponse.json({ error: 'Sign in with this Member ID to update its Player Profile.' }, { status: 403 });
}
try {
const supabase = createAdminSupabaseClient();
const { data: existing, error: selectError } = await supabase
.from('power_profiles')
.select('member_id')
.eq('member_id', profile.member_id)
.maybeSingle();
if (selectError) {
if (isMissingTableError(selectError)) return tableMissingResponse();
return NextResponse.json({ error: selectError.message }, { status: 500 });
}
const payload = {
name: profile.name,
member_id: profile.member_id,
governor_gear: profile.governor_gear || null,
charms: profile.charms || null,
hero_gear: profile.hero_gear || null,
pet_power: profile.pet_power || null,
masters_power: profile.masters_power || null,
mystic_trial_score: profile.mystic_trial_score || null,
infantry_tier: profile.infantry_tier || null,
infantry_tg: profile.infantry_tg || null,
cavalry_tier: profile.cavalry_tier || null,
cavalry_tg: profile.cavalry_tg || null,
archer_tier: profile.archer_tier || null,
archer_tg: profile.archer_tg || null,
heroes: profile.heroes,
updated_at: new Date().toISOString(),
};
const { data, error } = await supabase
.from('power_profiles')
.upsert(payload, { onConflict: 'member_id' })
.select(PUBLIC_COLUMNS)
.single();
if (error) {
if (isMissingTableError(error)) return tableMissingResponse();
return NextResponse.json({ error: error.message }, { status: 500 });
}
return NextResponse.json({ profile: publicPowerProfile(data), status: existing ? 'updated' : 'created' });
} catch (error) {
return NextResponse.json({ error: error.message }, { status: 500 });
}
}
