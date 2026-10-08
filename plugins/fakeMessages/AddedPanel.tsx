/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";

import { ChatIcon, TrashIcon } from "./icons";
import { chats, clearAll, total } from "./store";
import { cl, IconButton, Panel, Row } from "./ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** How many there are, and the one button that takes them all back */
export function AddedPanel() {
    const update = useForceUpdater();
    const n = total();

    return (
        <Panel title="Your fake messages">
            <div className={cl("rows")}>
                <Row
                    icon={ChatIcon}
                    round={false}
                    name={n ? plural(n, "fake message") : "No fake messages yet"}
                    detail={n ? `In ${plural(chats(), "conversation")}` : "Right-click a message or a conversation to add one"}
                >
                    <IconButton
                        icon={TrashIcon}
                        variant="dangerSecondary"
                        disabled={!n}
                        onClick={() => {
                            clearAll();
                            update();
                        }}
                    >
                        Remove All
                    </IconButton>
                </Row>
            </div>
        </Panel>
    );
}
