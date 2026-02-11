import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { CalendarOptions, EventClickArg, DatesSetArg } from '@fullcalendar/core';

export function useCalendarConfig(options: {
  onEventClick: (arg: EventClickArg) => void;
  onDatesSet: (arg: DatesSetArg) => void;
}): { calendarOptions: CalendarOptions } {
  const calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    eventClick: options.onEventClick,
    datesSet: options.onDatesSet,
    editable: false,
    selectable: false,
    dayMaxEvents: true,
    height: 'auto',
    nowIndicator: true,
    slotMinTime: '08:00:00',
    slotMaxTime: '21:00:00',
  };

  return { calendarOptions };
}
