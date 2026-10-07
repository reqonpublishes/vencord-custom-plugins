/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { FormSwitch } from "@components/FormSwitch";
import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, openModal, UserStore, useState } from "@webpack/common";

import { addCall } from "./store";

export const cl = classNameFactory("vc-cfc-");

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
        if (!began) return setError("That is not a date this understands");

        const length = Number(minutes);
        if (!ongoing && (!Number.isFinite(length) || length < 0)) return setError("Say how long it lasted, in minutes");

        const authorId = fromMe ? me?.id : (others[0] ?? me?.id);
        if (!authorId) return setError("Nobody to have started it");

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
        { text: "Add", variant: "primary", onClick: add },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];

    return (
        <Modal
            {...rootProps}
            size="md"
            title="Add Call"
            notice={error ? { message: error, type: "critical" } : undefined}
            actions={actions}
        >
            <section className={cl("section")}>
                <h3 className={cl("label")}>Started by</h3>
                <div className={cl("chips")}>
                    <Chip on={!fromMe} onClick={() => setFromMe(false)}>Them</Chip>
                    <Chip on={fromMe} onClick={() => setFromMe(true)}>Me</Chip>
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
                        className={cl("input")}
                        value={time}
                        onChange={e => setStartedAt(`${date}T${e.currentTarget.value || time}`)}
                    />
                </div>
                <div className={cl("row")}>
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
                    <div className={cl("row")}>
                        <div className={cl("chips")}>
                            {LENGTHS.map(one => (
                                <Chip key={one.label} onClick={() => setMinutes(String(one.minutes))}>{one.label}</Chip>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>How it went</h3>
                <div className={cl("card")}>
                    <FormSwitch
                        title="Missed call"
                        description="You were not on it, so it reads as one you missed"
                        value={missed}
                        onChange={setMissed}
                        hideBorder
                    />
                    <FormSwitch
                        title="Still going"
                        description="No end, so the timer counts up and the call looks live"
                        value={ongoing}
                        onChange={setOngoing}
                        hideBorder
                    />
                </div>
            </section>
        </Modal>
    );
}

export const openAddCall = (seed: Seed) =>
    openModal(rootProps => <AddCallModal rootProps={rootProps} seed={seed} />);
