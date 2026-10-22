/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, openModal, TextArea, UserStore, useState } from "@webpack/common";

import { DateField } from "./DateField";
import { LockIcon, PersonIcon } from "./icons";
import { addMessage } from "./store";
import { cl } from "./ui";

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


function Chip({ onClick, children, wide }: { onClick(): void; children: string; wide?: boolean; }) {
    return (
        <button className={cl("chip", wide ? "chip-wide" : "")} onClick={onClick}>
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

/** Somebody the message could be from, as a button with their face on it */
function Person({ id, on, onPick }: { id: string; on: boolean; onPick(): void; }) {
    const user: any = UserStore.getUser(id);
    const me = id === UserStore.getCurrentUser()?.id;

    return (
        <button className={cl("choice", on ? "choice-on" : "")} onClick={onPick}>
            {user
                ? <img src={user.getAvatarURL?.(undefined, 64)} alt="" />
                : <div className={cl("choice-blank")}><PersonIcon height={16} width={16} /></div>}
            <div className={cl("choice-text")}>
                <div className={cl("choice-name")}>{user?.globalName ?? user?.username ?? "Unknown user"}</div>
                <div className={cl("choice-detail")}>{me ? "You" : user ? "@" + user.username : id}</div>
            </div>
        </button>
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

/** Past this many, a row of faces stops being a quick pick and becomes a wall */
const MOST_PEOPLE = 6;

export interface Seed {
    channelId: string;
    /** who it should look like it came from, when there is somebody obvious */
    authorId?: string;
    /** the moment it should sit at, when there is one worth starting from */
    sentAt?: number;
}

function AddMessageModal({ rootProps, seed }: { rootProps: RenderModalProps; seed: Seed; }) {
    const me: any = UserStore.getCurrentUser();
    const channel: any = ChannelStore.getChannel(seed.channelId);

    // Everybody it would be natural for a message here to be from: the people in the
    // conversation, whoever wrote the message this was opened on, and you.
    const people = [...new Set<string>(
        [seed.authorId, ...(channel?.recipients ?? []), me?.id].filter(Boolean)
    )].slice(0, MOST_PEOPLE);

    const [authorId, setAuthorId] = useState(seed.authorId ?? people[0] ?? me?.id ?? "");
    const [other, setOther] = useState(false);
    const [content, setContent] = useState("");
    const [sentAt, setSentAt] = useState(toInputValue(new Date(seed.sentAt ?? Date.now())));
    const [edited, setEdited] = useState(false);
    const [highlight, setHighlight] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const typedUser: any = other && authorId ? UserStore.getUser(authorId) : null;

    const nudge = (ms: number) => {
        const date = fromInputValue(sentAt);
        if (date) setSentAt(toInputValue(new Date(date.getTime() + ms)));
    };

    const add = () => {
        const when = fromInputValue(sentAt);
        if (!when) return setError("Pick a valid date and time.");
        if (!authorId.trim()) return setError("Choose who the message is from.");
        if (!content.trim()) return setError("Type what the message says.");

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
        { text: "Add Message", variant: "primary", onClick: add },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Add Fake Message"
            notice={error ? { message: error, type: "critical" } : undefined}
            actions={actions}
        >
            <section className={cl("section")}>
                <h3 className={cl("label")}>From</h3>
                <div className={cl("choices")}>
                    {people.map(id => (
                        <Person
                            key={id}
                            id={id}
                            on={!other && authorId === id}
                            onPick={() => {
                                setOther(false);
                                setAuthorId(id);
                                setError(null);
                            }}
                        />
                    ))}
                    <button
                        className={cl("choice", other ? "choice-on" : "")}
                        onClick={() => {
                            setOther(true);
                            setAuthorId("");
                        }}
                    >
                        <div className={cl("choice-blank")}><PersonIcon height={16} width={16} /></div>
                        <div className={cl("choice-text")}>
                            <div className={cl("choice-name")}>Someone else</div>
                            <div className={cl("choice-detail")}>By user ID</div>
                        </div>
                    </button>
                </div>

                {other && (
                    <>
                        <div className={cl("line")}>
                            <input
                                type="text"
                                inputMode="numeric"
                                className={cl("input")}
                                value={authorId}
                                placeholder="User ID"
                                autoFocus
                                onChange={e => {
                                    setAuthorId(e.currentTarget.value.replace(/[^0-9]/g, ""));
                                    setError(null);
                                }}
                            />
                        </div>
                        <div className={cl("hint")}>
                            {typedUser
                                ? `From ${typedUser.globalName ?? typedUser.username} (@${typedUser.username})`
                                : "Right-click a person and choose Copy User ID. The name appears once Discord has loaded them."}
                        </div>
                    </>
                )}
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
                <div className={cl("shifts")}>
                    {OFFSETS.map(({ label, ms }) => (
                        <Chip key={label} onClick={() => nudge(ms)}>{label}</Chip>
                    ))}
                    <Chip wide onClick={() => setSentAt(toInputValue(new Date()))}>Now</Chip>
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
                        onChange={setHighlight}
                        hideBorder
                    />

                    <div className={cl("divider")} />

                    <FormSwitch
                        className={cl("switch")}
                        title={"Show \"(edited)\" tag"}
                        description="Adds the edited marker"
                        value={edited}
                        onChange={setEdited}
                        hideBorder
                    />
                </div>
            </section>

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>Message</h3>
                <TextArea
                    value={content}
                    onChange={(next: string) => {
                        setContent(next);
                        setError(null);
                    }}
                    placeholder="What the message says (markdown works)"
                    rows={3}
                    autosize
                    onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add();
                    }}
                />

                <div className={cl("footnote")}>
                    <LockIcon height={14} width={14} />
                    <span>Only you see this message. Nothing is sent to Discord.</span>
                </div>
            </section>
        </Modal>
    );
}

export const openAddMessage = (seed: Seed) =>
    openModal(rootProps => <AddMessageModal rootProps={rootProps} seed={seed} />);
