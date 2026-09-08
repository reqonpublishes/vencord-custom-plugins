/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { FormSwitch } from "@components/FormSwitch";
import { Message, ModalAction, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, TextArea, useLayoutEffect, useRef, useState } from "@webpack/common";

import { applyEdit, getHighlight, getOriginal, isEdited, looksLikePing, resetEdit, toDate } from "./edits";

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

const splitValue = (value: string) => {
    const at = value.indexOf("T");
    return at === -1 ? [value, "00:00:00"] : [value.slice(0, at), value.slice(at + 1)];
};

function Chip({ onClick, children, title }: { onClick(): void; children: string; title?: string; }) {
    return (
        <button className={cl("chip")} onClick={onClick} title={title}>
            {children}
        </button>
    );
}

/** A date box and a time box side by side, instead of one long field */
function DateTimeField({ value, onChange }: { value: string; onChange(next: string): void; }) {
    const [date, time] = splitValue(value);

    return (
        <div className={cl("field")}>
            <input
                type="date"
                className={cl("input")}
                value={date}
                onChange={e => onChange(`${e.currentTarget.value || date}T${time}`)}
            />
            <input
                type="time"
                step={1}
                className={cl("input", "input-time")}
                value={time}
                onChange={e => onChange(`${date}T${e.currentTarget.value || time}`)}
            />
        </div>
    );
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

/** The eye-with-a-slash beside the "only you" line */
const PrivateIcon = () => (
    <svg viewBox="0 0 24 24" height={14} width={14} aria-hidden className={cl("footnote-icon")}>
        <path
            fill="currentColor"
            d="M2.7 3.4 21.3 22l1.4-1.4-3.3-3.3A12.5 12.5 0 0 0 23 12s-4-7-11-7a10.7 10.7 0 0 0-4.7 1.1L4.1 2 2.7 3.4Zm6.1 6.1 5.7 5.7a4 4 0 0 1-5.7-5.7Z"
        />
        <path
            fill="currentColor"
            d="M12 19c-7 0-11-7-11-7a13.4 13.4 0 0 1 3.6-4.2l2.9 2.9a4 4 0 0 0 5.8 5.8l2.4 2.4A11 11 0 0 1 12 19Z"
        />
    </svg>
);

/** The flex item of `bar` that `el` sits inside, or null if it isn't in there at all */
function itemOf(bar: HTMLElement, el: HTMLElement) {
    let node = el;
    while (node.parentElement && node.parentElement !== bar) node = node.parentElement;

    return node.parentElement === bar ? node : null;
}

/**
 * The action bar, laid out the way this modal wants it.
 *
 * Discord gives the footer one row: this slot on the left, the buttons on the right, each
 * sized to its own label. That leaves the buttons huddled in the middle of a wide modal
 * with dead space either side, and puts a footnote where it reads as a fourth control.
 *
 * There is no prop for any of this, so it's done from here. The row is found by walking up
 * to the first ancestor that also holds the buttons - durable in a way that matching
 * Discord's generated class names is not - then the buttons are stretched to share the
 * full width and this note is dropped onto a line of its own beneath them.
 *
 * Only styles are set, never the tree, so React stays free to re-render around it; every
 * value is recorded first and put back on the way out. It runs after each render rather
 * than once, so anything React does overwrite is restored on the next pass - and because
 * layout effects all run before the browser paints, the restore and reapply are invisible.
 */
function Footnote({ author }: { author: string; }) {
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const note = ref.current;
        if (!note) return;

        let child: HTMLElement = note;
        let parent = note.parentElement;
        while (parent && !parent.querySelector("button")) {
            child = parent;
            parent = parent.parentElement;
        }
        if (!parent) return;

        // Only touch it if it really is a horizontal row of items. If Discord ever moves
        // the buttons out of this slot's ancestry we'd find something else entirely, and
        // stretching a column to full width would wreck the modal; leaving the footer
        // alone is a far better failure than that.
        const layout = getComputedStyle(parent);
        if (!layout.display.includes("flex") || !layout.flexDirection.startsWith("row")) return;

        const bar = parent;
        const item = child;

        const undo: (() => void)[] = [];
        const style = (el: HTMLElement, prop: string, value: string) => {
            const previous = el.style.getPropertyValue(prop);
            undo.push(() => el.style.setProperty(prop, previous));
            el.style.setProperty(prop, value);
        };

        style(bar, "flex-wrap", "wrap");
        // a full width item can't share a line, and ordering it last puts that line below
        style(item, "flex", "1 0 100%");
        style(item, "order", "99");

        // every button in the bar is one of the actions; this note holds none of its own
        const buttons = [...bar.querySelectorAll<HTMLElement>("button")];
        const groups = new Set<HTMLElement>();
        for (const button of buttons) {
            const owner = itemOf(bar, button);
            if (owner && owner !== item) groups.add(owner);
        }

        if (groups.size === 1) {
            // the usual shape: one container holding all of them. Widen it to the whole
            // line, then let the buttons share that line out between themselves, so two
            // buttons take half each and a third simply narrows them to a third each.
            const [group] = groups;
            style(group, "flex", "1 1 100%");
            style(group, "display", "flex");
            style(group, "gap", "8px");

            for (const button of buttons) style(button, "flex", "1 1 0");
        } else {
            // or each button is its own item in the bar, which shares out the same way
            for (const group of groups) style(group, "flex", "1 1 0");
        }

        return () => {
            for (let i = undo.length - 1; i >= 0; i--) undo[i]();
        };
    });

    return (
        <div className={cl("footnote")} ref={ref}>
            <PrivateIcon />
            <span><strong>@{author}</strong> &mdash; only you can see this</span>
        </div>
    );
}

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
        if (!date) return setError("That's not a date I can parse. Expected format: 2026-09-08 14:30:00");

        let edited: Date | null = null;
        if (showEdited) {
            edited = fromInputValue(editedAt);
            if (!edited) return setError("The edited time isn't a date I can parse.");
        }

        applyEdit(message, { content, timestamp: date, editedTimestamp: edited, highlight });
        rootProps.onClose();
    }

    function revert() {
        resetEdit(message.id);
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
            actionBarInput={<Footnote author={message.author?.username ?? "unknown"} />}
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
                <div className={cl("row")}>
                    <div className={cl("chips")}>
                        {OFFSETS.map(({ label, ms }) => (
                            <Chip key={label} onClick={() => nudge(ms)}>{label}</Chip>
                        ))}
                    </div>
                    <div className={cl("chips")}>
                        <Chip onClick={() => setTimestamp(toInputValue(new Date()))}>Now</Chip>
                        <Chip onClick={() => setTimestamp(toInputValue(originalDate))}>Original</Chip>
                    </div>
                </div>
            </section>

            <section className={cl("section")}>
                <h3 className={cl("label")}>Appearance</h3>
                <div className={cl("card")}>
                    <FormSwitch
                        className={cl("switch")}
                        title="Highlighted message"
                        description="The message looks as if it had mentioned you"
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
                        description="Adds the edited marker, at a time you choose"
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
                            <div className={cl("row", "row-end")}>
                                <div className={cl("chips")}>
                                    <Chip onClick={() => setEditedAt(toInputValue(new Date()))}>Now</Chip>
                                    <Chip onClick={() => setEditedAt(timestamp)} title="Same moment the message was sent">
                                        Match sent
                                    </Chip>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>Content</h3>
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
                    placeholder="Message content (markdown works)"
                    onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) apply();
                    }}
                />
            </section>
        </Modal>
    );
}

export function openInspectModal(message: Message) {
    openModal(props => <InspectModal rootProps={props} message={message} />);
}
