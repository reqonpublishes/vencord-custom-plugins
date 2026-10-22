/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Channel, Guild } from "@vencord/discord-types";
import { FluxDispatcher, Menu } from "@webpack/common";

import { canHide, channelCount, hideChannel, invalidateChannels, isChannelHidden, loadChannels, showChannel, startChannels, stopChannels } from "./channels";
import { EyeIcon, HashIcon, ServerIcon } from "./icons";
import { knownList } from "./known";
import { place } from "./menu";
import { unwatchMutuals, watchMutuals } from "./mutuals";
import { settings } from "./settings";
import { count, forgetFresh, hideFresh, hideServer, invalidate, isHidden, isLoaded, listNow, load, showServer, start, stop } from "./store";
import { About } from "./ui";
import { done } from "./undo";

const guildCtx: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild?.id || !settings.store.guildMenu) return;

    const away = isHidden(guild.id);
    const Icon = away ? EyeIcon : ServerIcon;

    place(children, 20,
        <Menu.MenuItem
            id="vc-chs-server"
            key="vc-chs-server"
            label={away ? "Unhide Server" : "Hide Server"}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
            action={() => away
                ? done("Unhide Server", () => showServer(guild.id), () => hideServer(guild.id))
                : done("Hide Server", () => hideServer(guild.id), () => showServer(guild.id))}
        />
    );
};

/** A channel in a server: taken off the channel list, or put back */
const channelCtx: NavContextMenuPatchCallback = (children, { channel }: { channel?: Channel; }) => {
    if (!canHide(channel) || !settings.store.channelMenu) return;

    const away = isChannelHidden(channel!.id);
    const Icon = away ? EyeIcon : HashIcon;

    place(children, 21,
        <Menu.MenuItem
            id="vc-chs-channel"
            key="vc-chs-channel"
            label={away ? "Unhide Channel" : "Hide Channel"}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
            action={() => away
                ? done("Unhide Channel", () => showChannel(channel!.id), () => hideChannel(channel!.id))
                : done("Hide Channel", () => hideChannel(channel!.id), () => showChannel(channel!.id))}
        />
    );
};

/** Whether the plugin is meant to be on */
let alive = false;

/**
 * Goes up on every start and stop. A start that had to wait checks it is still the latest
 * one: off and on again while the first was waiting is a second start, and only that one
 * should carry on.
 */
let runs = 0;

/** Which servers you were in the last time the plugin was on */
const known = knownList("HideServers_Known", listNow, isHidden);

/** Screen Share Protection says the share is over: show what only the share hid */
const onShareEnded = () => void setTimeout(() => alive && known.shareEnded(ids => ids.forEach(id => showServer(id))), 0);


/** Put away what was joined while the plugin could not see, if asked to, and take the list down */
function catchUp() {
    known.catchUp(!!settings.store.hideNew, hideFresh);
}

/** The catching up booked by a reconnect, so switching off can call it off */
let connectTimer: ReturnType<typeof setTimeout> | null = null;

function cancelConnect() {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = null;
}

/** Discord sends every server again on a reconnect, including any joined meanwhile */
const afterConnect = () => {
    known.cancel();

    cancelConnect();
    connectTimer = setTimeout(() => {
        connectTimer = null;

        // Switched off in the moment between: nothing is new to an off plugin.
        if (alive) catchUp();
    }, 0);
};

/**
 * A server joined or left while the plugin is on: seen, so not new next time - or, while the
 * screen is shared, a server joined live, hidden until the share ends.
 */
const onListChange = () => void setTimeout(() => alive && known.arrived(hideFresh), 0);

migratePluginSettings("HideServers", "CustomPluginHideServers");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "HideServers",
    description: "Hide servers from your server list, and channels from a server's channel list. You stay in all of them and nobody is told.",
    tags: ["Servers", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],
    enabledByDefault: true,

    settings,

    /** One line for Additional Settings: how many are hidden */
    hubSummary() {
        const parts = [count() && plural(count(), "server"), channelCount() && plural(channelCount(), "channel")].filter(Boolean);
        return parts.length ? parts.join(", ") + " hidden" : "";
    },

    settingsAboutComponent: () => (
        <About
            menus
            icon={ServerIcon}
            title="Hide servers and channels"
            steps={[
                <>Right-click a server and choose <strong>Hide Server</strong>, or a channel and choose <strong>Hide Channel</strong>.</>,
                <>You stay in it and still get its messages. It is just not shown in the list.</>,
                <>Unhide any of them from the list below.</>
            ]}
        />
    ),

    contextMenus: {
        "guild-context": guildCtx,
        "channel-context": channelCtx
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged() {
        invalidate();
        invalidateChannels();
    },

    async start() {
        // Only the first start reads from disk. After that the list is already in memory,
        // and not waiting is what lets switching back on happen at once.
        alive = true;
        const mine = ++runs;
        if (!isLoaded()) {
            await load();

            // Switched off again while the list was being read, or off and on again - in
            // which case the newer start does this.
            if (mine !== runs) return;
        }
        await loadChannels();
        if (mine !== runs) return;

        start();
        startChannels();
        watchMutuals();
        FluxDispatcher.subscribe("CONNECTION_OPEN", afterConnect);
        FluxDispatcher.subscribe("GUILD_CREATE", onListChange);
        window.addEventListener("vc-share-ended", onShareEnded);
        FluxDispatcher.subscribe("GUILD_DELETE", onListChange);

        await known.load();
        if (mine === runs) catchUp();
    },

    stop() {
        alive = false;
        runs++;
        cancelConnect();
        known.leave();
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", afterConnect);
        FluxDispatcher.unsubscribe("GUILD_CREATE", onListChange);
        window.removeEventListener("vc-share-ended", onShareEnded);
        FluxDispatcher.unsubscribe("GUILD_DELETE", onListChange);
        unwatchMutuals();
        // The bar goes back to how Discord has it; the list of what was hidden is kept.
        stop();
        stopChannels();
        known.giveBack(forgetFresh);
    }
});
