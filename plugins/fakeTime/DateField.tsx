/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./date.css";

import { findByPropsLazy } from "@webpack";
import { moment, Popout, useRef, useState } from "@webpack/common";

import { CalendarIcon, ChevronDownIcon } from "./icons";
import { cl } from "./ui";

/** Discord's own calendar - the one it opens when you schedule a server event */
const Calendar: { CalendarPicker: any; } = findByPropsLazy("CalendarPicker");

const two = (n: number) => String(n).padStart(2, "0");

/**
 * A day, and optionally a time, chosen the way Discord chooses them.
 *
 * The day is a button that opens Discord's calendar floating under it, the way its own pickers
 * open - over the page rather than in it, so nothing moves, and gone with a click anywhere else
 * or Escape. The time, when there is one, is hours and minutes you can type or nudge with the
 * arrow keys, and AM or PM. Nothing here is the operating system's own picker, which looks like
 * nothing else in Discord.
 *
 * The same field as Inspect Profiles', copied so neither plugin depends on the other.
 */
export function DateField({ value, onChange, withTime, maxToday = true }: {
    value: number;
    onChange(ms: number): void;
    withTime?: boolean;
    maxToday?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLButtonElement>(null);
    const day = new Date(value);

    const pickDay = (picked: any) => {
        const next = new Date(value);
        const chosen = picked.toDate() as Date;
        next.setFullYear(chosen.getFullYear(), chosen.getMonth(), chosen.getDate());
        onChange(next.getTime());
        setOpen(false);
    };

    const hours12 = day.getHours() % 12 || 12;
    const pm = day.getHours() >= 12;

    const setTime = (h12: number, minutes: number, isPm: boolean) => {
        const next = new Date(value);
        next.setHours((h12 % 12) + (isPm ? 12 : 0), minutes, 0, 0);
        onChange(next.getTime());
    };

    /** A number box that takes typing, and the arrow keys, within its range */
    const Num = ({ val, min, max, label, onSet }: { val: number; min: number; max: number; label: string; onSet(n: number): void; }) => (
        <input
            className={cl("time-num")}
            aria-label={label}
            inputMode="numeric"
            value={two(val)}
            onChange={e => {
                const n = parseInt(e.currentTarget.value.replace(/\D/g, "").slice(-2), 10);
                if (!isNaN(n)) onSet(Math.min(max, Math.max(min, n)));
            }}
            onKeyDown={e => {
                if (e.key === "ArrowUp") { e.preventDefault(); onSet(val >= max ? min : val + 1); }
                if (e.key === "ArrowDown") { e.preventDefault(); onSet(val <= min ? max : val - 1); }
            }}
        />
    );

    return (
        <div className={cl("date")}>
            <div className={cl("date-row")}>
                <Popout
                    position="bottom"
                    align="left"
                    shouldShow={open && !!Calendar?.CalendarPicker}
                    onRequestClose={() => setOpen(false)}
                    targetElementRef={button}
                    renderPopout={() => (
                        <div className={cl("calendar")}>
                            <Calendar.CalendarPicker
                                value={moment(value)}
                                maxDate={maxToday ? moment() : undefined}
                                onSelect={pickDay}
                                autoFocus
                            />
                        </div>
                    )}
                >
                    {() => (
                        <button ref={button} className={cl("date-button", open ? "date-open" : "")} onClick={() => setOpen(v => !v)} aria-expanded={open}>
                            <CalendarIcon height={18} width={18} />
                            <span>{day.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</span>
                            <ChevronDownIcon className={cl("date-chevron")} height={18} width={18} />
                        </button>
                    )}
                </Popout>

                {withTime && (
                    <div className={cl("time")}>
                        <Num val={hours12} min={1} max={12} label="Hour" onSet={h => setTime(h, day.getMinutes(), pm)} />
                        <span className={cl("time-colon")}>:</span>
                        <Num val={day.getMinutes()} min={0} max={59} label="Minutes" onSet={m => setTime(hours12, m, pm)} />
                        <div className={cl("time-ampm")} role="radiogroup" aria-label="AM or PM">
                            {(["AM", "PM"] as const).map(half => (
                                <button
                                    key={half}
                                    role="radio"
                                    aria-checked={(half === "PM") === pm}
                                    className={cl("ampm", (half === "PM") === pm ? "ampm-on" : "")}
                                    onClick={() => setTime(hours12, day.getMinutes(), half === "PM")}
                                >
                                    {half}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
