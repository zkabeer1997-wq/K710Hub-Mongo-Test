'use client';

import ApplyTab from './ApplyTab';
import MineTab from './MineTab';
import ScheduleTab from './ScheduleTab';
import { useAppointments } from './useAppointments';

export default function KvkAppointments({ tab }) {
  const appts = useAppointments();
  return (
    <div id={`appt-panel-${tab}`} className="appt-panel">
      {tab === 'apply' && <ApplyTab appts={appts} />}
      {tab === 'mine' && <MineTab appts={appts} />}
      {tab === 'schedule' && <ScheduleTab />}
    </div>
  );
}
