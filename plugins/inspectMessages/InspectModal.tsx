/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { FormSwitch } from "@components/FormSwitch";
import { Message, ModalAction, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, TextArea, useState } from "@webpack/common";

import { DateField } from "./DateField";
import { applyEdit, getHighlight, getOriginal, isEdited, looksLikePing, resetEdit, restoreEdit, snapshotEdit, toDate } from "./edits";
import { LockIcon } from "./icons";
import { remember } from "./undo";

export const cl = classNameFactory("vc-cim-");

const pad = (n: number) => String(n).padStart(2, "0");

/** Date -> the "YYYY-MM-DDTHH:mm:ss" local time string <input type="datetime-local"> wants */
function toInputValue(date: Date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fromInputValue(value: string) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
}


function Chip({ onClick, children, title, wide }: { onClick(): void; children: string; title?: string; wide?: boolean; }) {
    return (
        <button className={cl("chip", wide ? "chip-wide" : "")} onClick={onClick} title={title}>
            {children}
        </button>
    );
}

/** The day from Discord's own calendar, and the time beside it - the seconds are kept as they were */
function DateTimeField({ value, onChange }: { value: string; onChange(next: string): void; }) {
    const at = new Date(value);
    const ms = isNaN(at.getTime()) ? Date.now() : at.getTime();

    return <DateField value={ms} withTime maxToday={false} onChange={next => onChange(toInputValue(new Date(next)))} />;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const OFFSETS = [
    { label: "-1d", ms: -DAY },
    { label: "-1h", ms: -HOUR },
    { label: "-5m", ms: -5 * MINUTE },
    { label: "+5m", ms: 5 * MINUTE },
    { label: "+1h", ms: HOUR },
    { label: "+1d", ms: DAY }
];

function InspectModal({ rootProps, message }: { rootProps: RenderModalProps; message: Message; }) {
    const [content, setContent] = useState(message.content ?? "");
    const [timestamp, setTimestamp] = useState(() => toInputValue(toDate(message.timestamp)));
    const [showEdited, setShowEdited] = useState(() => message.editedTimestamp != null);
    const [editedAt, setEditedAt] = useState(
        () => toInputValue(message.editedTimestamp ? toDate(message.editedTimestamp) : toDate(message.timestamp))
    );
    const [error, setError] = useState<string | null>(null);

    // a choice you already made is kept; otherwise seed it from the text
    const savedHighlight = getHighlight(message.id);
    const [highlight, setHighlight] = useState(
        () => savedHighlight ?? (looksLikePing(message.content ?? "") || !!(message as any).mentioned)
    );
    // once it's your choice it stops following the text, across reopens too
    const [highlightTouched, setHighlightTouched] = useState(savedHighlight !== undefined);

    // for an already-edited message the record holds our values, so go back to the saved snapshot
    const saved = getOriginal(message.id);
    const originalDate = saved ? new Date(saved.timestamp) : toDate(message.timestamp);

    function nudge(ms: number) {
        const date = fromInputValue(timestamp) ?? originalDate;
        setTimestamp(toInputValue(new Date(date.getTime() + ms)));
    }

    function apply() {
        const date = fromInputValue(timestamp);
        if (!date) return setError("Pick a valid date and time.");

        let edited: Date | null = null;
        if (showEdited) {
            edited = fromInputValue(editedAt);
            if (!edited) return setError("Pick a valid edited date and time.");
        }

        const before = snapshotEdit(message.id);
        applyEdit(message, { content, timestamp: date, editedTimestamp: edited, highlight });
        remember("Inspect Message", () => restoreEdit(message.id, before));
        rootProps.onClose();
    }

    function revert() {
        const before = snapshotEdit(message.id);
        resetEdit(message.id);
        remember("Revert Message", () => restoreEdit(message.id, before));
        rootProps.onClose();
    }

    const actions: ModalAction[] = [
        { text: "Apply", variant: "primary", onClick: apply },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];
    if (isEdited(message.id)) {
        actions.push({ text: "Revert", variant: "critical-primary", onClick: revert });
    }

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Inspect Message"
            notice={error ? { message: error, type: "critical" } : undefined}
            actions={actions}
        >

            <section className={cl("section")}>
                <h3 className={cl("label")}>Sent</h3>
                <DateTimeField
                    value={timestamp}
                    onChange={next => {
                        setTimestamp(next);
                        setError(null);
                    }}
                />
                <div className={cl("shifts")}>
                    {OFFSETS.map(({ label, ms }) => (
                        <Chip key={label} onClick={() => nudge(ms)}>{label}</Chip>
                    ))}
                    <Chip wide onClick={() => setTimestamp(toInputValue(new Date()))}>Now</Chip>
                    <Chip wide onClick={() => setTimestamp(toInputValue(originalDate))}>Original</Chip>
                </div>
            </section>

            <section className={cl("section")}>
                <h3 className={cl("label")}>Appearance</h3>
                <div className={cl("card")}>
                    <FormSwitch
                        className={cl("switch")}
                        title="Highlighted message"
                        description="Looks as if it mentioned you"
                        value={highlight}
                        onChange={next => {
                            setHighlight(next);
                            setHighlightTouched(true);
                        }}
                        hideBorder
                    />

                    <div className={cl("divider")} />

                    <FormSwitch
                        className={cl("switch")}
                        title={"Show \"(edited)\" tag"}
                        description="Adds the edited marker"
                        value={showEdited}
                        onChange={setShowEdited}
                        hideBorder
                    />

                    {/* indented under the switch that reveals it, so it reads as part of it */}
                    {showEdited && (
                        <div className={cl("nested")}>
                            <DateTimeField
                                value={editedAt}
                                onChange={next => {
                                    setEditedAt(next);
                                    setError(null);
                                }}
                            />
                            <div className={cl("shifts", "shifts-end")}>
                                <Chip onClick={() => setEditedAt(toInputValue(new Date()))}>Now</Chip>
                                <Chip onClick={() => setEditedAt(timestamp)} title="Same moment the message was sent">
                                    Match sent
                                </Chip>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>Message</h3>
                <TextArea
                    value={content}
                    onChange={next => {
                        setContent(next);
                        // keep following the text until you decide for yourself
                        if (!highlightTouched) setHighlight(looksLikePing(next));
                    }}
                    rows={3}
                    autosize
                    spellCheck={false}
                    placeholder="What the message says (markdown works)"
                    onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) apply();
                    }}
                />

                <div className={cl("footnote")}>
                    <LockIcon height={14} width={14} />
                    <span>Only you see this change. Nothing is sent to Discord.</span>
                </div>
            </section>
        </Modal>
    );
}

export function openInspectModal(message: Message) {
    openModal(props => <InspectModal rootProps={props} message={message} />);
}
