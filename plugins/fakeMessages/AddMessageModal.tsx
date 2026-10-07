/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { FormSwitch } from "@components/FormSwitch";
import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, TextArea, UserStore,useState } from "@webpack/common";

import { addMessage } from "./store";

export const cl = classNameFactory("vc-cfm-");

const pad = (n: number) => String(n).padStart(2, "0");

/** Date -> the "YYYY-MM-DDTHH:mm:ss" local time string the date and time boxes want */
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
                className={cl("input")}
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
    { label: "+1h", ms: HOUR }
];

export interface Seed {
    channelId: string;
    /** who it should look like it came from, when there is somebody obvious */
    authorId?: string;
    /** the moment it should sit at, when there is one worth starting from */
    sentAt?: number;
}

function AddMessageModal({ rootProps, seed }: { rootProps: RenderModalProps; seed: Seed; }) {
    const me: any = UserStore.getCurrentUser();

    const [authorId, setAuthorId] = useState(seed.authorId ?? me?.id ?? "");
    const [content, setContent] = useState("");
    const [sentAt, setSentAt] = useState(toInputValue(new Date(seed.sentAt ?? Date.now())));
    const [edited, setEdited] = useState(false);
    const [highlight, setHighlight] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const author: any = authorId ? UserStore.getUser(authorId) : null;

    const nudge = (ms: number) => {
        const date = fromInputValue(sentAt);
        if (date) setSentAt(toInputValue(new Date(date.getTime() + ms)));
    };

    const add = () => {
        const when = fromInputValue(sentAt);
        if (!when) return setError("That is not a date this understands");
        if (!authorId.trim()) return setError("Say who it came from");
        if (!content.trim()) return setError("Say what it says");

        addMessage({
            channelId: seed.channelId,
            authorId: authorId.trim(),
            content,
            sentAt: when.getTime(),
            edited: edited || undefined,
            highlight: highlight || undefined
        });

        rootProps.onClose();
    };

    const actions: ModalAction[] = [
        { text: "Add", variant: "primary", onClick: add },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Add Message"
            notice={error ? { message: error, type: "critical" } : undefined}
            actions={actions}
        >
            <section className={cl("section")}>
                <h3 className={cl("label")}>From</h3>
                <div className={cl("field")}>
                    <input
                        type="text"
                        className={cl("input")}
                        value={authorId}
                        placeholder="A user ID"
                        onChange={e => {
                            setAuthorId(e.currentTarget.value.trim());
                            setError(null);
                        }}
                    />
                </div>
                <div className={cl("row")}>
                    <div className={cl("chips")}>
                        {me && <Chip onClick={() => setAuthorId(me.id)}>Me</Chip>}
                        {seed.authorId && seed.authorId !== me?.id && (
                            <Chip onClick={() => setAuthorId(seed.authorId!)}>Them</Chip>
                        )}
                    </div>
                </div>
                <div className={cl("who")}>
                    {author
                        ? `Will look like it came from ${author.globalName ?? author.username}`
                        : "Nobody is loaded under that ID yet. The name fills in once Discord has seen them."}
                </div>
            </section>

            <section className={cl("section")}>
                <h3 className={cl("label")}>Sent</h3>
                <DateTimeField
                    value={sentAt}
                    onChange={next => {
                        setSentAt(next);
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
                        <Chip onClick={() => setSentAt(toInputValue(new Date()))}>Now</Chip>
                    </div>
                </div>
            </section>

            <section className={cl("section")}>
                <h3 className={cl("label")}>Appearance</h3>
                <div className={cl("card")}>
                    <FormSwitch
                        title="Highlighted message"
                        description="The message looks as if it had mentioned you"
                        value={highlight}
                        onChange={setHighlight}
                        hideBorder
                    />
                    <FormSwitch
                        title={"Show \"(edited)\" tag"}
                        description="Adds the edited marker to it"
                        value={edited}
                        onChange={setEdited}
                        hideBorder
                    />
                </div>
            </section>

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>Says</h3>
                <TextArea
                    value={content}
                    onChange={(next: string) => {
                        setContent(next);
                        setError(null);
                    }}
                    placeholder="What the message says"
                    rows={4}
                />
            </section>
        </Modal>
    );
}

export const openAddMessage = (seed: Seed) =>
    openModal(rootProps => <AddMessageModal rootProps={rootProps} seed={seed} />);
