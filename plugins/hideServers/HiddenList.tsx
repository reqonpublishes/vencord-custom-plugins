/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useForceUpdater } from "@utils/react";
import { SelectedGuildStore } from "@webpack/common";

import { channelCount, channelInfo, hiddenChannels, showAllChannels, showChannel } from "./channels";
import { EyeIcon, EyeOffIcon, HashIcon } from "./icons";
import { count, hideAll, infoOf, names, showAll, showServer } from "./store";
import { cl, Empty, IconButton, Panel, RoundButton, Row } from "./ui";

/**
 * The servers currently hidden, and the way back.
 *
 * The list is the way back because the usual one is gone: a hidden server is not on the bar
 * to be right-clicked.
 */
export function HiddenList() {
    const update = useForceUpdater();
    const held = names();
    const channels = hiddenChannels();

    return (
        <Panel
            title="Hidden"
            count={count() + channelCount()}
            actions={
                <>
                    <IconButton
                        icon={EyeOffIcon}
                        variant="secondary"
                        onClick={() => {
                            // Not the one you are in. Hiding the server on screen leaves you
                            // standing in something that is no longer on the bar to leave by.
                            hideAll(SelectedGuildStore.getGuildId());
                            update();
                        }}
                    >
                        Hide All
                    </IconButton>
                    {!!(count() + channelCount()) && (<IconButton
                        icon={EyeIcon}
                        variant="secondary"
                        onClick={() => {
                            showAll();
                            showAllChannels();
                            update();
                        }}
                    >
                        Unhide All
                    </IconButton>)}
                </>
            }
        >
            {!held.length && !channels.length && (
                <Empty
                    icon={EyeOffIcon}
                    title="Nothing hidden"
                    text="Right-click a server and choose Hide Server, or a channel and choose Hide Channel."
                />
            )}

            {!!(held.length || channels.length) && (
                <div className={cl("rows")}>
                    {!!held.length && <div className={cl("group-title")}>Servers &mdash; {held.length}</div>}
                    {held.map(([guildId]) => {
                        const info = infoOf(guildId);

                        return (
                            <Row key={guildId} round={false} image={info.image} name={info.name} detail={info.detail}>
                                <RoundButton icon={EyeIcon} label="Unhide" onClick={() => { showServer(guildId); update(); }} />
                            </Row>
                        );
                    })}
                    {!!channels.length && <div className={cl("group-title")}>Channels &mdash; {channels.length}</div>}
                    {channels.map(([channelId]) => {
                        const info = channelInfo(channelId);

                        return (
                            <Row key={channelId} icon={HashIcon} round={false} name={info.name} detail={info.detail}>
                                <RoundButton icon={EyeIcon} label="Unhide" onClick={() => { showChannel(channelId); update(); }} />
                            </Row>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}
