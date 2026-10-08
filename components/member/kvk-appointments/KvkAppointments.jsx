'use client';

import MineTab from './MineTab';
import ScheduleTab from './ScheduleTab';
import StackTableLabels from '../../ui/StackTableLabels';
import { useAppointments } from './useAppointments';

export default function KvkAppointments({ tab }) {
  const appts = useAppointments();
  return (
    <div id={`appt-panel-${tab}`} className="appt-panel">
      <StackTableLabels />
      {tab === 'mine' && <MineTab appts={appts} />}
      {tab === 'schedule' && <ScheduleTab />}
    </div>
  );
}
