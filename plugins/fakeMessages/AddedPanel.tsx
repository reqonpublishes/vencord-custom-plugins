/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";

import { ChatIcon, TrashIcon } from "./icons";
import { placeOf } from "./places";
import { asRecord, clearAll, clearChannel, total } from "./store";
import { cl, Empty, IconButton, Panel, Row } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every conversation with fake messages in it, most first, each with its own way to take them back */
export function AddedPanel() {
    const update = useForceUpdater();
    const n = total();
    const places = Object.entries(asRecord()).filter(([, list]) => list.length).sort((a, b) => b[1].length - a[1].length);

    return (
        <Panel
            title="Fake messages"
            count={n}
            actions={n ? (
                <IconButton icon={TrashIcon} variant="dangerSecondary" onClick={() => { clearAll(); update(); }}>Remove All</IconButton>
            ) : undefined}
        >
            {!n ? (
                <Empty icon={ChatIcon} title="No fake messages" text="Right-click a message and choose Add Fake Message Here." />
            ) : (
                <div className={cl("rows")}>
                    {places.map(([channelId, list]) => {
                        const place = placeOf(channelId);
                        return (
                            <Row key={channelId} image={place.image} icon={ChatIcon} name={place.name} detail={[plural(list.length, "fake message"), place.detail].filter(Boolean).join(" · ")}>
                                <IconButton icon={TrashIcon} variant="dangerSecondary" onClick={() => { clearChannel(channelId); update(); }}>Remove</IconButton>
                            </Row>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
