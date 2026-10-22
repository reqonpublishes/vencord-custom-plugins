/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";

import { EyeIcon, EyeOffIcon } from "./icons";
import { placeOf } from "./places";
import { clearAll, perChat, showChannel } from "./store";
import { cl, Empty, IconButton, Panel, Row } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every conversation with something hidden in it, each with its own way back */
export function HiddenPanel() {
    const update = useForceUpdater();
    const places = perChat();

    return (
        <Panel
            title="Hidden messages"
            count={places.length}
            actions={places.length ? (
                <IconButton icon={EyeIcon} variant="secondary" onClick={() => { clearAll(); update(); }}>Unhide All</IconButton>
            ) : undefined}
        >
            {!places.length ? (
                <Empty icon={EyeOffIcon} title="Nothing hidden" text="Right-click a message and choose Hide Message, or a conversation to hide all of it." />
            ) : (
                <div className={cl("rows")}>
                    {places.map(({ channelId, messages, ranges, whole }) => {
                        const place = placeOf(channelId);
                        const what = whole ? "Whole conversation" : [messages && plural(messages, "message"), ranges && plural(ranges, "range")].filter(Boolean).join(", ");
                        return (
                            <Row key={channelId} image={place.image} icon={EyeOffIcon} name={place.name} detail={[what, place.detail].filter(Boolean).join(" · ")}>
                                <IconButton icon={EyeIcon} variant="secondary" onClick={() => { showChannel(channelId); update(); }}>Unhide</IconButton>
                            </Row>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
