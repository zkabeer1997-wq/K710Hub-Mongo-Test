import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readMemberSession } from '../../../../lib/memberAuth';
import { getFormGate } from '../../../../lib/formGates.mjs';
import FormClosedNotice from '../../../../components/FormClosedNotice';
import NobleAdvisorForm from './NobleAdvisorForm';
export const metadata={title:'Noble Advisor Schedule | K710'};
export default async function NobleAdvisorPage(){
 const session=await readMemberSession({cookies:await cookies()});
 if(!session) redirect('/player-record?next=/forms/flamedragon-tyrant/noble-advisor');
 const gate=await getFormGate('noble');
 return <main className="page public-page"><div className="public-shell single-form prep-wide"><Link href="/forms/flamedragon-tyrant">← Flamedragon forms</Link><h1>Noble Advisor Schedule</h1>{gate.is_open===false?<FormClosedNotice message={gate.message}/>:<NobleAdvisorForm memberId={session.memberId}/>}</div></main>;
}
