/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";

import { PhoneIcon, TrashIcon } from "./icons";
import { placeOf } from "./places";
import { clearAll, clearChannel, perChat, total } from "./store";
import { Empty, IconButton, Panel, Row, Rows } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every conversation with fake calls in it, most first, each with its own way to take them back */
export function AddedPanel() {
    const update = useForceUpdater();
    const n = total();
    const places = perChat().filter(([, count]) => count).sort((a, b) => b[1] - a[1]);

    return (
        <Panel
            title="Fake calls"
            count={n}
            actions={n ? (
                <IconButton icon={TrashIcon} variant="dangerSecondary" onClick={() => { clearAll(); update(); }}>Remove All</IconButton>
            ) : undefined}
        >
            {!n ? (
                <Empty icon={PhoneIcon} title="No fake calls" text="Right-click a message in a DM and choose Add Fake Call." />
            ) : (
                <Rows>
                    {places.map(([channelId, count]) => {
                        const place = placeOf(channelId);
                        return (
                            <Row key={channelId} image={place.image} icon={PhoneIcon} name={place.name} detail={[plural(count, "fake call"), place.detail].filter(Boolean).join(" · ")}>
                                <IconButton icon={TrashIcon} variant="dangerSecondary" onClick={() => { clearChannel(channelId); update(); }}>Remove</IconButton>
                            </Row>
                        );
                    })}
                </Rows>
            )}
        </Panel>
    );
}
