/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";

import { count, names, showAll, showChat } from "./store";

const cl = classNameFactory("vc-chd-");

/**
 * The conversations currently hidden, and the way back.
 *
 * This is the only reliable way back. A hidden conversation is not in the sidebar to be
 * right-clicked, and Discord cannot look one up by the person either, because as far as it
 * is concerned the conversation is closed - so the list has to live somewhere that does not
 * depend on finding it.
 */
export function HiddenList() {
    const update = useForceUpdater();
    const held = names();

    if (!count()) {
        return <div className={cl("empty")}>Nothing is hidden.</div>;
    }

    return (
        <div className={cl("list")}>
            {held.map(([channelId, name]) => (
                <div className={cl("row")} key={channelId}>
                    <span className={cl("name")}>{name}</span>
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={() => {
                            showChat(channelId);
                            update();
                        }}
                    >
                        Show
                    </Button>
                </div>
            ))}

            <Button
                className={cl("all")}
                size="small"
                variant="dangerSecondary"
                onClick={() => {
                    showAll();
                    update();
                }}
            >
                Show all {count()}
            </Button>
        </div>
    );
}
