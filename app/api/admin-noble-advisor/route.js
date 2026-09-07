import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { NOBLE_FIELDS, validateNobleAdvisor } from '../../../lib/nobleAdvisor.mjs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control':'no-store' };
export async function GET(request) {
 if (!(await isAdminRequest(request))) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 const {data,error}=await createAdminSupabaseClient().from('noble_advisor_submissions').select('*').order('updated_at',{ascending:false});
 return NextResponse.json(error?{error:'Unable to load bookings.'}:{rows:data || []},{status:error?500:200,headers});
}
export async function PATCH(request) {
 if (!(await isAdminRequest(request))) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
 let body;try{body=await request.json();}catch{return NextResponse.json({error:'Invalid update.'},{status:400,headers});}
 if(!body?.id || !NOBLE_FIELDS.includes(body.key)) return NextResponse.json({error:'Invalid field.'},{status:400,headers});
 const db=createAdminSupabaseClient();
 const {data:existing,error:readError}=await db.from('noble_advisor_submissions').select('*').eq('id',body.id).maybeSingle();
 if(readError || !existing) return NextResponse.json({error:'Booking not found.'},{status:404,headers});
 const {record,error}=validateNobleAdvisor({...existing,[body.key]:body.value});
 if(error)return NextResponse.json({error},{status:400,headers});
 const {error:saveError}=await db.from('noble_advisor_submissions').update({[body.key]:record[body.key],updated_at:new Date().toISOString()}).eq('id',body.id);
 return NextResponse.json(saveError?{error:'Unable to save booking.'}:{ok:true},{status:saveError?500:200,headers});
}
