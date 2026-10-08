/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { useForceUpdater } from "@utils/react";
import { SelectedChannelStore } from "@webpack/common";

import { EyeIcon, EyeOffIcon, GroupIcon } from "./icons";
import { count, hideAll, infoOf, names, showAll, showChat } from "./store";
import { cl, Empty, IconButton, Panel, Row } from "./ui";

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

    return (
        <Panel
            title="Hidden DMs"
            count={count()}
            actions={
                <>
                    <IconButton
                        icon={EyeOffIcon}
                        onClick={() => {
                            // Not the one on screen: you would be left looking at a
                            // conversation that is no longer in the list beside it.
                            hideAll(SelectedChannelStore.getChannelId());
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
                    title="No hidden DMs"
                    text="Right-click a conversation and choose Hide DM, or hide them all at once."
                />
            )}

            {!!held.length && (
                <div className={cl("rows")}>
                    {held.map(([channelId]) => {
                        const info = infoOf(channelId);

                        return (
                            <Row
                                key={channelId}
                                image={info.image}
                                icon={info.group ? GroupIcon : undefined}
                                name={info.name}
                                detail={info.detail}
                            >
                                <Button
                                    size="small"
                                    variant="secondary"
                                    onClick={() => {
                                        showChat(channelId);
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
