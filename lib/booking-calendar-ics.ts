import type { BookingResult } from "@/lib/public-booking-types";

const CRLF = "\r\n";
const DEFAULT_LOCATION = "Relief Chiropractic";
const DEFAULT_DURATION_MINUTES = 30;

/** Escape text for ICS (RFC 5545). */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Fold long lines at 75 octets (simple char count). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join(CRLF);
}

/** Parse API/UI 12h time e.g. "8:00 AM", "08:00 AM". */
export function parseBookingTime12h(time: string): { hours: number; minutes: number } | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === "PM" && hours !== 12) hours += 12;
  if (ap === "AM" && hours === 12) hours = 0;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function formatIcsLocalDateTime(dateIso: string, hours: number, minutes: number): string {
  const [y, mo, d] = dateIso.split("-").map((p) => parseInt(p, 10));
  if (!y || !mo || !d) return "";
  return `${String(y).padStart(4, "0")}${String(mo).padStart(2, "0")}${String(d).padStart(2, "0")}T${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}00`;
}

function addMinutesToLocal(
  dateIso: string,
  hours: number,
  minutes: number,
  durationMinutes: number,
): { endDateIso: string; endHours: number; endMinutes: number } {
  const [y, mo, d] = dateIso.split("-").map((p) => parseInt(p, 10));
  const start = new Date(y, mo - 1, d, hours, minutes, 0);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const endDateIso = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return { endDateIso, endHours: end.getHours(), endMinutes: end.getMinutes() };
}

export function buildBookingIcsCalendar(results: BookingResult[]): string {
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}${String(now.getUTCSeconds()).padStart(2, "0")}Z`;

  const events = results
    .map((r) => {
      const startParts = parseBookingTime12h(r.start_time);
      if (!startParts) return null;

      const duration = r.duration_minutes ?? DEFAULT_DURATION_MINUTES;
      const dtStart = formatIcsLocalDateTime(r.appointment_date, startParts.hours, startParts.minutes);
      if (!dtStart) return null;

      const endParts = addMinutesToLocal(
        r.appointment_date,
        startParts.hours,
        startParts.minutes,
        duration,
      );
      const dtEnd = formatIcsLocalDateTime(
        endParts.endDateIso,
        endParts.endHours,
        endParts.endMinutes,
      );

      const summary = escapeIcsText(`${r.service} — Relief Chiropractic`);
      const description = escapeIcsText(
        `Confirmation #${r.appointment_id}\\nPatient: ${r.patient}\\nProvider: ${r.provider}`,
      );
      const uid = `relief-booking-${r.appointment_id}@reliefchiropractic.net`;

      const lines = [
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        foldLine(`SUMMARY:${summary}`),
        foldLine(`DESCRIPTION:${description}`),
        foldLine(`LOCATION:${escapeIcsText(DEFAULT_LOCATION)}`),
        "END:VEVENT",
      ];
      return lines.join(CRLF);
    })
    .filter((block): block is string => Boolean(block));

  if (events.length === 0) return "";

  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Relief Chiropractic//Booking//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...events, "END:VCALENDAR"].join(CRLF);
}

/** Trigger download of an .ics file (works on desktop and most mobile browsers). */
export function downloadBookingIcsFile(results: BookingResult[], filename = "relief-chiropractic-appointment.ics"): boolean {
  const ics = buildBookingIcsCalendar(results);
  if (!ics) return false;

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
