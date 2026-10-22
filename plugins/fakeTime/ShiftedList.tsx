/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { closeAllModals } from "@utils/modal";
import { ChannelStore, NavigationRouter, useEffect, useState } from "@webpack/common";

import { ChatIcon, ClockIcon, UndoIcon } from "./icons";
import { placeOf } from "./places";
import { allMoves, describe, isWhole, Move, movesOf, onChange, removeMove, resetAll, setMoves } from "./store";
import { openFakeTime } from "./TimeModal";
import { Empty, IconButton, Panel, RoundButton, Row, Rows } from "./ui";
import { remember } from "./undo";

function openChat(channelId: string, messageId?: string) {
    const channel = ChannelStore.getChannel(channelId);
    closeAllModals();
    NavigationRouter.transitionTo(`/channels/${channel?.guild_id ?? "@me"}/${channelId}${messageId ? "/" + messageId : ""}`);
}

/** Which messages a move covers, in words */
function whichPart(move: Move) {
    if (isWhole(move)) return "Whole conversation";
    if (!move.first) return "Part of it";
    return move.last && move.last !== move.first ? `“${move.first}” to “${move.last}”` : `“${move.first}”`;
}

/** Every conversation and part moved in time: click one to change it, or put it back */
export function ShiftedList() {
    const [, redraw] = useState(0);
    useEffect(() => onChange(() => redraw(n => n + 1)), []);

    const list = allMoves();

    return (
        <Panel
            title="Moved"
            count={list.length}
            actions={!!list.length && (
                <IconButton icon={UndoIcon} variant="dangerSecondary" onClick={resetAll}>Reset All</IconButton>
            )}
        >
            {!list.length ? (
                <Empty icon={ClockIcon} title="Nothing moved yet" text="Right-click a conversation or a message, open Fake Options and choose Fake Time." />
            ) : (
                <Rows>
                    {list.map(({ channelId, move }) => {
                        const place = placeOf(channelId);
                        return (
                            <Row
                                key={`${channelId}-${move.from ?? ""}-${move.to ?? ""}`}
                                image={place.image}
                                icon={ClockIcon}
                                name={place.name}
                                detail={`${whichPart(move)} · ${describe(move.ms)}`}
                                title="Change the time"
                                onClick={() => openFakeTime(channelId, { from: move.from, to: move.to })}
                            >
                                <RoundButton icon={ChatIcon} label="Open Chat" onClick={() => openChat(channelId, move.from)} />
                                <RoundButton icon={UndoIcon} label="Reset" danger onClick={() => {
                                    const before = movesOf(channelId);
                                    removeMove(channelId, move);
                                    remember("Reset Fake Time", () => setMoves(channelId, before));
                                }} />
                            </Row>
                        );
                    })}
                </Rows>
            )}
        </Panel>
    );
}
