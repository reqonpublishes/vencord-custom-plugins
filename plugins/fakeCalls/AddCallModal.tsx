/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FormSwitch } from "@components/FormSwitch";
import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, openModal, UserStore, useState } from "@webpack/common";

import { GroupIcon, LockIcon, PersonIcon } from "./icons";
import { addCall } from "./store";
import { cl } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");

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

function Chip({ onClick, children, on }: { onClick(): void; children: string; on?: boolean; }) {
    return (
        <button className={cl("chip", on ? "chip-on" : "")} onClick={onClick}>
            {children}
        </button>
    );
}

/** One side of the call, as a button with their face on it */
function Side({ id, group, on, onPick }: { id?: string; group?: boolean; on: boolean; onPick(): void; }) {
    const user: any = id ? UserStore.getUser(id) : null;
    const me = !!id && id === UserStore.getCurrentUser()?.id;

    return (
        <button className={cl("choice", on ? "choice-on" : "")} onClick={onPick}>
            {user
                ? <img src={user.getAvatarURL?.(undefined, 64)} alt="" />
                : (
                    <div className={cl("choice-blank")}>
                        {group ? <GroupIcon height={16} width={16} /> : <PersonIcon height={16} width={16} />}
                    </div>
                )}
            <div className={cl("choice-text")}>
                <div className={cl("choice-name")}>{me ? "You" : user?.globalName ?? user?.username ?? "Them"}</div>
                <div className={cl("choice-detail")}>{me ? "You called them" : "They called you"}</div>
            </div>
        </button>
    );
}

const LENGTHS = [
    { label: "1m", minutes: 1 },
    { label: "5m", minutes: 5 },
    { label: "30m", minutes: 30 },
    { label: "1h", minutes: 60 },
    { label: "3h", minutes: 180 }
];

export interface Seed {
    channelId: string;
    startedAt?: number;
}

function AddCallModal({ rootProps, seed }: { rootProps: RenderModalProps; seed: Seed; }) {
    const me: any = UserStore.getCurrentUser();
    const channel: any = ChannelStore.getChannel(seed.channelId);
    const others: string[] = (channel?.recipients ?? []).filter((id: string) => id !== me?.id);

    // Who rang. In a DM there are two people it could have been, and which one decides
    // whether the line reads as a call you made or one you were given.
    const [fromMe, setFromMe] = useState(false);
    const [startedAt, setStartedAt] = useState(toInputValue(new Date(seed.startedAt ?? Date.now())));
    const [minutes, setMinutes] = useState("5");
    const [ongoing, setOngoing] = useState(false);
    const [missed, setMissed] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [date, time] = splitValue(startedAt);

    const add = () => {
        const began = fromInputValue(startedAt);
        if (!began) return setError("Pick a valid date and time.");

        const length = Number(minutes);
        if (!ongoing && (!minutes.trim() || !Number.isFinite(length) || length < 0)) {
            return setError("Type how long the call lasted, in minutes.");
        }

        const authorId = fromMe ? me?.id : (others[0] ?? me?.id);
        if (!authorId) return setError("There is nobody here to have started the call.");

        // Missed is not a flag anywhere: a call is missed when you are not among the people
        // who were on it, so that is the only thing that changes.
        const everyone = [...new Set([authorId, ...others, me?.id].filter(Boolean))] as string[];
        const participants = missed ? everyone.filter(id => id !== me?.id) : everyone;

        addCall({
            channelId: seed.channelId,
            authorId,
            startedAt: began.getTime(),
            endedAt: ongoing ? null : began.getTime() + Math.round(length * 60_000),
            participants: participants.length ? participants : [authorId]
        });

        rootProps.onClose();
    };

    const actions: ModalAction[] = [
        { text: "Add Call", variant: "primary", onClick: add },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Add Fake Call"
            notice={error ? { message: error, type: "critical" } : undefined}
            actions={actions}
        >
            <section className={cl("section")}>
                <h3 className={cl("label")}>Started by</h3>
                <div className={cl("choices")}>
                    <Side id={others[0]} group={others.length > 1} on={!fromMe} onPick={() => setFromMe(false)} />
                    <Side id={me?.id} on={fromMe} onPick={() => setFromMe(true)} />
                </div>
            </section>

            <section className={cl("section")}>
                <h3 className={cl("label")}>Started</h3>
                <div className={cl("field")}>
                    <input
                        type="date"
                        className={cl("input")}
                        value={date}
                        onChange={e => setStartedAt(`${e.currentTarget.value || date}T${time}`)}
                    />
                    <input
                        type="time"
                        step={1}
                        className={cl("input", "input-time")}
                        value={time}
                        onChange={e => setStartedAt(`${date}T${e.currentTarget.value || time}`)}
                    />
                </div>
                <div className={cl("line")}>
                    <div />
                    <div className={cl("chips")}>
                        <Chip onClick={() => setStartedAt(toInputValue(new Date()))}>Now</Chip>
                    </div>
                </div>
            </section>

            {!ongoing && (
                <section className={cl("section")}>
                    <h3 className={cl("label")}>Lasted (minutes)</h3>
                    <div className={cl("field")}>
                        <input
                            type="number"
                            min={0}
                            className={cl("input")}
                            value={minutes}
                            onChange={e => {
                                setMinutes(e.currentTarget.value);
                                setError(null);
                            }}
                        />
                    </div>
                    <div className={cl("line")}>
                        <div className={cl("chips")}>
                            {LENGTHS.map(one => (
                                <Chip
                                    key={one.label}
                                    on={minutes === String(one.minutes)}
                                    onClick={() => {
                                        setMinutes(String(one.minutes));
                                        setError(null);
                                    }}
                                >
                                    {one.label}
                                </Chip>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>How it went</h3>
                <div className={cl("card")}>
                    <FormSwitch
                        className={cl("switch")}
                        title="Missed call"
                        description="You were not on it, so it reads as a call you missed"
                        value={missed}
                        onChange={setMissed}
                        hideBorder
                    />

                    <div className={cl("divider")} />

                    <FormSwitch
                        className={cl("switch")}
                        title="Still going"
                        description="No end time, so the call looks live and its timer counts up"
                        value={ongoing}
                        onChange={setOngoing}
                        hideBorder
                    />
                </div>

                <div className={cl("footnote")}>
                    <LockIcon height={14} width={14} />
                    <span>Only you can see this call. Nobody is rung.</span>
                </div>
            </section>
        </Modal>
    );
}

export const openAddCall = (seed: Seed) =>
    openModal(rootProps => <AddCallModal rootProps={rootProps} seed={seed} />);
