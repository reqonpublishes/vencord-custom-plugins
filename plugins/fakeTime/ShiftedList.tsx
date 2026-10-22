/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { closeAllModals } from "@utils/modal";
import { ChannelStore, NavigationRouter, useEffect, useState } from "@webpack/common";

import { ChatIcon, ClockIcon, UndoIcon } from "./icons";
import { placeOf } from "./places";
import { describe, onChange, resetAll, resetShift, setShift, shifted } from "./store";
import { openFakeTime } from "./TimeModal";
import { cl, Empty, IconButton, Panel, RoundButton, Row } from "./ui";
import { remember } from "./undo";

function openChat(channelId: string) {
    const channel = ChannelStore.getChannel(channelId);
    closeAllModals();
    NavigationRouter.transitionTo(`/channels/${channel?.guild_id ?? "@me"}/${channelId}`);
}

/** Every conversation moved in time: click one to change it, or put it back */
export function ShiftedList() {
    const [, redraw] = useState(0);
    useEffect(() => onChange(() => redraw(n => n + 1)), []);

    const list = shifted();

    return (
        <Panel
            title="Moved conversations"
            count={list.length}
            actions={!!list.length && (
                <IconButton icon={UndoIcon} variant="dangerSecondary" onClick={resetAll}>Reset All</IconButton>
            )}
        >
            {!list.length ? (
                <Empty icon={ClockIcon} title="Nothing moved yet" text="Right-click a conversation, open Fake Options and choose Fake Time." />
            ) : (
                <div className={cl("rows")}>
                    {list.map(([channelId, ms]) => {
                        const place = placeOf(channelId);
                        return (
                            <Row
                                key={channelId}
                                image={place.image}
                                icon={ClockIcon}
                                name={place.name}
                                detail={describe(ms)}
                                title="Change the time"
                                onClick={() => openFakeTime(channelId)}
                            >
                                <RoundButton icon={ChatIcon} label="Open Chat" onClick={() => openChat(channelId)} />
                                <RoundButton icon={UndoIcon} label="Reset" danger onClick={() => { resetShift(channelId); remember("Reset Fake Time", () => setShift(channelId, ms)); }} />
                            </Row>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
