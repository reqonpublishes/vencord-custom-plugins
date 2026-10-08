/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";
import { SelectedGuildStore } from "@webpack/common";

import { EyeIcon, EyeOffIcon } from "./icons";
import { count, hideAll, infoOf, names, showAll, showServer } from "./store";
import { cl, Empty, IconButton, Panel, Row } from "./ui";

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
        <Panel
            title="Hidden servers"
            count={count()}
            actions={
                <>
                    <IconButton
                        icon={EyeOffIcon}
                        onClick={() => {
                            // Not the one you are in. Hiding the server on screen leaves you
                            // standing in something that is no longer on the bar to leave by.
                            hideAll(SelectedGuildStore.getGuildId());
                            update();
                        }}
                    >
                        Hide All
                    </IconButton>
                    <IconButton
                        icon={EyeIcon}
                        variant="secondary"
                        disabled={!count()}
                        onClick={() => {
                            showAll();
                            update();
                        }}
                    >
                        Unhide All
                    </IconButton>
                </>
            }
        >
            {!held.length && (
                <Empty
                    icon={EyeOffIcon}
                    title="No hidden servers"
                    text="Right-click a server and choose Hide Server, or hide them all at once."
                />
            )}

            {!!held.length && (
                <div className={cl("rows")}>
                    {held.map(([guildId]) => {
                        const info = infoOf(guildId);

                        return (
                            <Row key={guildId} round={false} image={info.image} name={info.name} detail={info.detail}>
                                <Button
                                    size="small"
                                    variant="secondary"
                                    onClick={() => {
                                        showServer(guildId);
                                        update();
                                    }}
                                >
                                    Unhide
                                </Button>
                            </Row>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
