/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";
import { SelectedGuildStore } from "@webpack/common";

import { count, hideAll, names, showAll, showServer } from "./store";

const cl = classNameFactory("vc-chs-");

/**
 * The servers currently hidden, and the way back.
 *
 * The list is the way back because the usual one is gone: a hidden server is not on the bar
 * to be right-clicked.
 */
export function HiddenList() {
    const update = useForceUpdater();
    const held = names();

    return (
        <div className={cl("list")}>
            <div className={cl("buttons")}>
                <Button
                    size="small"
                    onClick={() => {
                        // Not the one you are in. Hiding the server on screen leaves you
                        // standing in something that is no longer on the bar to leave by.
                        hideAll(SelectedGuildStore.getGuildId());
                        update();
                    }}
                >
                    Hide all servers
                </Button>
                <Button
                    size="small"
                    variant="dangerSecondary"
                    disabled={!count()}
                    onClick={() => {
                        showAll();
                        update();
                    }}
                >
                    Show all{count() ? ` ${count()}` : ""}
                </Button>
            </div>

            {!held.length && <div className={cl("empty")}>Nothing is hidden.</div>}

            {held.map(([guildId, name]) => (
                <div className={cl("row")} key={guildId}>
                    <span className={cl("name")}>{name}</span>
                    <Button
                        size="small"
                        variant="secondary"
                        onClick={() => {
                            showServer(guildId);
                            update();
                        }}
                    >
                        Show
                    </Button>
                </div>
            ))}
        </div>
    );
}
