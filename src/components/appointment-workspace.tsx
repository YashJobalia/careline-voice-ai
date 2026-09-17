"use client";
import { useEffect, useState } from "react";
import { WorkspaceDialog } from "./workspace-dialog";
import { doctors, formatSlot, type Slot } from "@/lib/clinic";
import type { Account, Mutation, Navigation, Visit } from "@/lib/workspace";

export const clinicDay = (value: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export function AppointmentWorkspace({
  user,
  visits,
  slots,
  clinic,
  display,
  onDisplay,
  onPrepare,
  search,
  onSearch,
  onClearSearch,
}: {
  user: Account;
  visits: Visit[];
  slots: Slot[];
  clinic: boolean;
  display: Navigation;
  onDisplay: (value: Navigation) => void;
  onPrepare: (value: Mutation) => void;
  search?: { query: string; results: Visit[]; truncated: boolean };
  onSearch: (query: string) => Promise<void>;
  onClearSearch: () => void;
}) {
  const selected = display.selectedDate || "";
  const setSelected = (selectedDate: string) =>
    onDisplay({ ...display, selectedDate: selectedDate || undefined });
  const [doctor, setDoctor] = useState("");
  const [query, setQuery] = useState("");
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [date, setDate] = useState("");
  const [moving, setMoving] = useState<Visit>();
  const [booking, setBooking] = useState(false);
  const [reason, setReason] = useState<{
    visit: Visit;
    action: "cancel" | "request_reschedule";
  }>();
  useEffect(() => {
    if (display.booking) {
      setBooking(true);
      setMoving(undefined);
    }
    if (display.doctorId) setDoctor(display.doctorId);
  }, [display.booking, display.doctorId]);
  const month =
    display.month || clinicDay(new Date().toISOString()).slice(0, 7);
  const filter = display.filter || "all";
  const filtered = (
    search
      ? visits.filter((v) =>
          search.results.some((result) => result.id === v.id),
        )
      : visits
  ).filter((v) =>
    filter === "cancelled"
      ? v.status === "cancelled"
      : filter === "requests"
        ? v.reschedule_requested
        : filter === "upcoming"
          ? v.status === "confirmed" &&
            new Date(v.slot.starts_at).getTime() > Date.now()
          : filter === "past"
            ? new Date(v.slot.starts_at).getTime() <= Date.now()
            : true,
  );
  const days = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const first = new Date(`${month}-01T12:00:00Z`).getUTCDay();
  function shift(delta: number) {
    const d = new Date(`${month}-01T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    onDisplay({
      ...display,
      month: d.toISOString().slice(0, 7),
      selectedDate: undefined,
    });
  }
  const shown =
    display.mode === "calendar"
      ? filtered.filter(
          (v) =>
            clinicDay(v.slot.starts_at).startsWith(month) &&
            (!selected || clinicDay(v.slot.starts_at) === selected),
        )
      : filtered;
  function startMove(visit: Visit) {
    setMoving(visit);
    setDoctor(visit.slot.doctor_id);
    setBooking(true);
    setDate("");
  }
  return (
    <section className="workspace-panel">
      <form
        className="workspace-composer"
        onSubmit={async (event) => {
          event.preventDefault();
          setSearchBusy(true);
          setSearchError("");
          try {
            await onSearch(query);
          } catch (error) {
            setSearchError(
              error instanceof Error ? error.message : "Search unavailable.",
            );
          } finally {
            setSearchBusy(false);
          }
        }}
      >
        <input
          aria-label="Search permitted appointments"
          placeholder="Name, email, full phone or appointment reference"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          minLength={2}
          maxLength={254}
          required
        />
        <button disabled={searchBusy || query.trim().length < 2}>
          {searchBusy ? "Searching..." : "Search"}
        </button>
      </form>
      {searchError && <p role="alert">{searchError}</p>}
      {search && (
        <div className="workspace-toolbar">
          <p role="status">
            {search.results.length} matches for "{search.query}"
            {search.truncated
              ? ". Showing the first 100. Narrow your search."
              : ""}
          </p>
          <button
            onClick={() => {
              onClearSearch();
              setQuery("");
            }}
          >
            Clear search
          </button>
        </div>
      )}
      <div className="workspace-toolbar">
        <div>
          <h2>{clinic ? "Clinic appointments" : "Your appointments"}</h2>
          <p>
            {clinic
              ? "All doctors, all patients. Patient notes stay with each visit."
              : "Upcoming visits, past visits, and requests from your doctor."}
          </p>
        </div>
        <button
          className="primary-action"
          onClick={() => {
            setMoving(undefined);
            setBooking(true);
          }}
        >
          Book as patient
        </button>
      </div>
      <div className="workspace-toolbar">
        <div className="segmented">
          <button
            aria-pressed={display.mode !== "calendar"}
            onClick={() => onDisplay({ ...display, mode: "list" })}
          >
            List
          </button>
          <button
            aria-pressed={display.mode === "calendar"}
            onClick={() => onDisplay({ ...display, mode: "calendar" })}
          >
            Calendar
          </button>
        </div>
        <label>
          Show{" "}
          <select
            aria-label="Appointment filter"
            value={filter}
            onChange={(e) =>
              onDisplay({
                ...display,
                filter: e.target.value as Navigation["filter"],
              })
            }
          >
            {[
              ["all", "All appointments"],
              ["upcoming", "Upcoming"],
              ["past", "Past"],
              ["cancelled", "Cancelled"],
              ["requests", "Reschedule requests"],
            ].map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {display.mode === "calendar" && (
        <div className="appointment-calendar">
          <div className="workspace-toolbar">
            <button onClick={() => shift(-1)} aria-label="Previous month">
              Previous
            </button>
            <h3>
              {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </h3>
            <button onClick={() => shift(1)} aria-label="Next month">
              Next
            </button>
          </div>
          <div className="calendar-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span className="calendar-weekday" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`empty${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const key = `${month}-${String(i + 1).padStart(2, "0")}`;
              const count = filtered.filter(
                (v) => clinicDay(v.slot.starts_at) === key,
              ).length;
              return (
                <button
                  key={key}
                  aria-label={`${key}, ${count} appointments`}
                  aria-pressed={selected === key}
                  onClick={() => setSelected(selected === key ? "" : key)}
                >
                  <span>{i + 1}</span>
                  {count > 0 && (
                    <small>
                      {count} visit{count === 1 ? "" : "s"}
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <p className="muted-copy">
            Times shown in America/Chicago. Select a date to see its visits.
          </p>
        </div>
      )}
      <div className="visit-list">
        {shown.length === 0 ? (
          <p className="empty-state">No appointments match this view.</p>
        ) : (
          shown.map((v) => (
            <article className="visit-card" key={v.id}>
              <div className="workspace-toolbar">
                <div>
                  <span className={`visit-status ${v.status}`}>
                    {v.status === "cancelled"
                      ? "Cancelled"
                      : new Date(v.slot.starts_at).getTime() <= Date.now()
                        ? "Past visit"
                        : "Upcoming"}
                  </span>
                  <h3>
                    {doctors.find((d) => d.id === v.slot.doctor_id)?.name}
                  </h3>
                  <p>{formatSlot(v.slot)}</p>
                </div>
                <span className="reference-code">{v.appointment_code}</span>
              </div>
              {clinic && (
                <p>
                  <strong>Patient:</strong> {v.patient_name}
                </p>
              )}
              {v.notes && (
                <details open={display.notesId === v.id || undefined}>
                  <summary>Visit notes</summary>
                  <Notes value={v.notes} />
                </details>
              )}
              {v.cancellation_reason && (
                <p>Cancellation reason: {v.cancellation_reason}</p>
              )}
              {v.reschedule_requested && (
                <div className="request-banner">
                  <strong>Your doctor requested a new time.</strong>
                  <p>
                    {v.reschedule_reason ||
                      "Please choose another available appointment."}
                  </p>
                </div>
              )}
              {v.status === "confirmed" &&
                new Date(v.slot.starts_at).getTime() > Date.now() && (
                  <div className="workspace-actions">
                    {v.session_id === user.id && (
                      <button onClick={() => startMove(v)}>Reschedule</button>
                    )}
                    <button
                      onClick={() => setReason({ visit: v, action: "cancel" })}
                    >
                      Cancel appointment
                    </button>
                    {clinic && (
                      <button
                        onClick={() =>
                          setReason({ visit: v, action: "request_reschedule" })
                        }
                      >
                        Request reschedule
                      </button>
                    )}
                  </div>
                )}
            </article>
          ))
        )}
      </div>
      {reason && (
        <WorkspaceDialog
          titleId="reason-title"
          onClose={() => setReason(undefined)}
        >
          <form
            className="workspace-form"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              onPrepare({
                action: reason.action,
                id: reason.visit.id,
                reason: String(data.get("reason") || ""),
              });
              setReason(undefined);
            }}
          >
            <h2 id="reason-title">
              {reason.action === "cancel"
                ? "Cancel appointment"
                : "Request a new appointment time"}
            </h2>
            <p>
              {reason.visit.patient_name} - {formatSlot(reason.visit.slot)}
            </p>
            <label>
              Reason (optional)
              <textarea name="reason" maxLength={600} />
            </label>
            <div className="workspace-actions">
              <button type="submit" className="primary-action">
                Review change
              </button>
              <button type="button" onClick={() => setReason(undefined)}>
                Back
              </button>
            </div>
          </form>
        </WorkspaceDialog>
      )}
      {booking && (
        <WorkspaceDialog
          titleId="booking-title"
          onClose={() => setBooking(false)}
        >
          <form
            className="workspace-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const slotId = String(f.get("slotId"));
              onPrepare(
                moving
                  ? { action: "reschedule", id: moving.id, slotId }
                  : {
                      action: "book",
                      slotId,
                      notes: {
                        concern: String(f.get("concern")),
                        duration: String(f.get("duration")),
                        severity: String(f.get("severity")),
                        context: String(f.get("context") || ""),
                      },
                    },
              );
              setBooking(false);
            }}
          >
            <h2 id="booking-title">
              {moving ? "Choose a new appointment" : "Book an appointment"}
            </h2>
            <p>
              {moving
                ? "Your current appointment stays reserved until the move succeeds."
                : "Share a little context so the doctor can prepare. Use fictional details for this demo."}
            </p>
            <label>
              Doctor
              <select
                required
                value={doctor}
                onChange={(e) => setDoctor(e.target.value)}
              >
                <option value="">Choose a doctor</option>
                {doctors
                  .filter((d) => d.id !== user.doctorId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} - {d.department}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Date (optional)
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Available time
              <select
                required
                name="slotId"
                key={`${doctor}-${date}`}
                defaultValue=""
              >
                <option value="">Choose a time</option>
                {slots
                  .filter(
                    (s) =>
                      s.doctor_id === doctor &&
                      (!date || clinicDay(s.starts_at) === date),
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSlot(s)}
                    </option>
                  ))}
              </select>
            </label>
            {!moving && (
              <>
                <label>
                  Main concern
                  <textarea
                    name="concern"
                    required
                    minLength={3}
                    maxLength={600}
                  />
                </label>
                <div className="form-columns">
                  <label>
                    How long has it been happening?
                    <input
                      name="duration"
                      required
                      maxLength={200}
                      placeholder="For example, three days"
                    />
                  </label>
                  <label>
                    How severe is it?
                    <input
                      name="severity"
                      required
                      maxLength={200}
                      placeholder="For example, mild"
                    />
                  </label>
                </div>
                <label>
                  Other context (optional)
                  <textarea name="context" maxLength={800} />
                </label>
              </>
            )}
            <div className="workspace-actions">
              <button type="submit" className="primary-action">
                Review appointment
              </button>
              <button type="button" onClick={() => setBooking(false)}>
                Back
              </button>
            </div>
          </form>
        </WorkspaceDialog>
      )}
    </section>
  );
}
export function Notes({ value }: { value: string }) {
  try {
    const notes = JSON.parse(value);
    return (
      <dl className="visit-notes">
        {Object.entries(notes).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{String(v) || "Not provided"}</dd>
          </div>
        ))}
      </dl>
    );
  } catch {
    return <p>{value}</p>;
  }
}
