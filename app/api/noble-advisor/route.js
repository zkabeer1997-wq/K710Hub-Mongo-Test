import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { readMemberSession } from '../../../lib/memberAuth';
import { validateNobleAdvisor } from '../../../lib/nobleAdvisor.mjs';
import { getFormGate } from '../../../lib/formGates.mjs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request) {
 const session = await readMemberSession(request);
 if (!session) return NextResponse.json({error:'Member login required.'},{status:401,headers});
 const db = createAdminSupabaseClient();
 const [{data:record,error},{data:profile}] = await Promise.all([db.from('noble_advisor_submissions').select('*').eq('member_id',session.memberId).maybeSingle(),db.from('power_profiles').select('name').eq('member_id',session.memberId).maybeSingle()]);
 if(error) return NextResponse.json({error:'Unable to load your booking.'},{status:500,headers});
 return NextResponse.json({record:record || {in_game_name:profile?.name || '',member_id:session.memberId}},{headers});
}
export async function POST(request) {
 const session = await readMemberSession(request);
 if (!session) return NextResponse.json({error:'Member login required.'},{status:401,headers});
 if ((await getFormGate('noble')).is_open === false) return NextResponse.json({error:'Noble Advisor bookings are closed.'},{status:403,headers});
 let body; try {body=await request.json();} catch {return NextResponse.json({error:'Invalid booking.'},{status:400,headers});}
 const {record,error}=validateNobleAdvisor(body);
 if(error) return NextResponse.json({error},{status:400,headers});
 const {error:saveError}=await createAdminSupabaseClient().from('noble_advisor_submissions').upsert({...record,member_id:session.memberId,updated_at:new Date().toISOString()},{onConflict:'member_id'});
 if(saveError) return NextResponse.json({error:'Unable to save your booking.'},{status:500,headers});
 return NextResponse.json({ok:true},{headers});
}
