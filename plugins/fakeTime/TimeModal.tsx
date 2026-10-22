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
import { describe, latestReal, messagesIn, Move, movesOf, msFor, outOfOrder, realTimeOf, setMove, setMoves } from "./store";
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

export type Part = Pick<Move, "from" | "to">;

function Chip({ onClick, children, wide }: { onClick(): void; children: string; wide?: boolean; }) {
    return (
        <button className={cl("chip", wide ? "chip-wide" : "")} onClick={onClick}>
            {children}
        </button>
    );
}

/** A message in a few words, for saying which part is which */
export function snippet(message: any): string {
    const text = String(message?.content ?? "").replace(/\s+/g, " ").trim();
    if (text) return text.length > 32 ? text.slice(0, 31) + "…" : text;
    if (message?.call) return "a call";
    if (message?.attachments?.length) return "an attachment";
    return "a message";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Move a conversation, or part of one, in time.
 *
 * Asked as "when was it sent" rather than "how far": that is the one moment you can picture -
 * the latest message for a whole conversation, the first one for a part - and every other
 * message moves with it, the gaps between them kept.
 */
function TimeModal({ rootProps, channelId, part }: { rootProps: RenderModalProps; channelId: string; part: Part; }) {
    const channel: any = ChannelStore.getChannel(channelId);
    const whole = !part.from && !part.to;
    const own = movesOf(channelId).find(move => (move.from ?? "") === (part.from ?? "") && (move.to ?? "") === (part.to ?? ""));

    const inside = whole ? [] : messagesIn(channelId, part);
    const anchorId = whole ? undefined : (part.from ?? inside[0]?.id);
    const real = whole ? latestReal(channelId, channel?.lastMessageId) : realTimeOf(channelId, anchorId!);
    // where it reads now: its own move, or the one it is under - a part of a moved chat starts there
    const [shift, setDraft] = useState(() => own?.ms ?? (whole ? 0 : msFor(channelId, anchorId)));
    const place = placeOf(channelId);
    const clash = whole ? null : outOfOrder(channelId, part, shift);

    const change = (label: string, run: () => void) => {
        const before = movesOf(channelId);
        run();
        remember(label, () => setMoves(channelId, before));
        rootProps.onClose();
    };

    const apply = () => {
        if (!own && shift === (whole ? 0 : msFor(channelId, anchorId))) return rootProps.onClose();
        const first = inside[0], last = inside[inside.length - 1];
        change("Fake Time", () => setMove(channelId, whole ? {} : { ...part, first: snippet(first), last: snippet(last) }, shift));
    };

    const actions: ModalAction[] = [
        { text: "Apply", variant: "primary", onClick: apply },
        { text: "Cancel", variant: "secondary", onClick: rootProps.onClose }
    ];
    if (own) actions.push({ text: "Reset", variant: "critical-primary", onClick: () => change("Reset Fake Time", () => setMove(channelId, part, 0)) });

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

            {!whole && (
                <section className={cl("section")}>
                    <h3 className={cl("label")}>Messages</h3>
                    <div className={cl("part")}>
                        <span className={cl("part-count")}>{plural(inside.length, "message")}</span>
                        <span className={cl("part-text")}>
                            {inside.length > 1
                                ? <>From “{snippet(inside[0])}” to “{snippet(inside[inside.length - 1])}”</>
                                : <>“{snippet(inside[0])}”</>}
                        </span>
                    </div>
                </section>
            )}

            <section className={cl("section", "section-last")}>
                <h3 className={cl("label")}>{whole ? "Latest message" : "First message"}</h3>
                <DateField value={real + shift} withTime maxToday={false} onChange={next => setDraft(next - real)} />
                <div className={cl("shifts")}>
                    {OFFSETS.map(({ label, ms }) => (
                        <Chip key={label} onClick={() => setDraft(now => now + ms)}>{label}</Chip>
                    ))}
                    <Chip wide onClick={() => setDraft(0)}>Real</Chip>
                </div>
                <div className={cl("hint", clash ? "hint-warn" : "")}>
                    {clash === "after"
                        ? "Now later than the message after it, so the times read out of order."
                        : clash === "before"
                            ? "Now earlier than the message before it, so the times read out of order."
                            : !shift
                                ? (whole ? "Every message shows when it was really sent." : "These messages show when they were really sent.")
                                : `${whole ? "Every message moves" : "These messages move"} ${describe(shift).toLowerCase()}, the gaps between them kept.`}
                </div>

                <div className={cl("footnote")}>
                    <LockIcon height={14} width={14} />
                    <span>Only you see this time. Nothing is sent to Discord.</span>
                </div>
            </section>
        </Modal>
    );
}

export const openFakeTime = (channelId: string, part: Part = {}) =>
    openModal(rootProps => <TimeModal rootProps={rootProps} channelId={channelId} part={part} />);
