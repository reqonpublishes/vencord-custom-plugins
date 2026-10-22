/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalAction, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, openModal, useState } from "@webpack/common";

import { DateField } from "./DateField";
import { LockIcon } from "./icons";
import { placeOf } from "./places";
import { describe, latestReal, resetShift, setShift, shiftOf } from "./store";
import { cl } from "./ui";
import { remember } from "./undo";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The same nudges as every other date here */
const OFFSETS = [
    { label: "-1d", ms: -DAY },
    { label: "-1h", ms: -HOUR },
    { label: "-5m", ms: -5 * MINUTE },
    { label: "+5m", ms: 5 * MINUTE },
    { label: "+1h", ms: HOUR },
    { label: "+1d", ms: DAY }
];

function Chip({ onClick, children, wide }: { onClick(): void; children: string; wide?: boolean; }) {
    return (
        <button className={cl("chip", wide ? "chip-wide" : "")} onClick={onClick}>
            {children}
        </button>
    );
}

/**
 * Move a conversation in time.
 *
 * Asked as "when was the latest message" rather than "how far": that is the one moment you
 * can picture, and every other message moves with it, the gaps between them kept.
 */
function TimeModal({ rootProps, channelId }: { rootProps: RenderModalProps; channelId: string; }) {
    const channel: any = ChannelStore.getChannel(channelId);
    const real = latestReal(channelId, channel?.lastMessageId);
    const [shift, setDraft] = useState(() => shiftOf(channelId));
    const place = placeOf(channelId);

    const apply = () => {
        const before = shiftOf(channelId);
        setShift(channelId, shift);
        remember("Fake Time", () => setShift(channelId, before));
        rootProps.onClose();
    };

    const actions: ModalAction[] = [
        { text: "Apply", variant: "primary", onClick: apply },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];
    if (shiftOf(channelId)) {
        actions.push({ text: "Reset", variant: "critical-primary", onClick: () => { const before = shiftOf(channelId); resetShift(channelId); remember("Reset Fake Time", () => setShift(channelId, before)); rootProps.onClose(); } });
    }

    return (
        <Modal {...rootProps} size="md" title="Fake Time" actions={actions}>
            <section className={cl("section")}>
                <h3 className={cl("label")}>Conversation</h3>
                <div className={cl("place")}>
                    {place.image ? <img className={cl("place-face")} src={place.image} alt="" /> : <div className={cl("place-face")} />}
                    <div>
                        <div className={cl("place-name")}>{place.name}</div>
                        {place.detail && <div className={cl("place-detail")}>{place.detail}</div>}
                    </div>
                </div>
            </section>

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>Latest message</h3>
                <DateField value={real + shift} withTime maxToday={false} onChange={next => setDraft(next - real)} />
                <div className={cl("shifts")}>
                    {OFFSETS.map(({ label, ms }) => (
                        <Chip key={label} onClick={() => setDraft(now => now + ms)}>{label}</Chip>
                    ))}
                    <Chip wide onClick={() => setDraft(0)}>Real</Chip>
                </div>
                <div className={cl("hint")}>
                    {shift ? `Every message moves ${describe(shift).toLowerCase()}, the gaps between them kept.` : "Every message shows when it was really sent."}
                </div>

                <div className={cl("footnote")}>
                    <LockIcon height={14} width={14} />
                    <span>Only you see this time. Nothing is sent to Discord.</span>
                </div>
            </section>
        </Modal>
    );
}

export const openFakeTime = (channelId: string) =>
    openModal(rootProps => <TimeModal rootProps={rootProps} channelId={channelId} />);
