/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";
import { Guild } from "@vencord/discord-types";
import { FluxDispatcher, Menu } from "@webpack/common";

import { EyeIcon, EyeOffIcon } from "./icons";
import { knownList } from "./known";
import { place } from "./menu";
import { unwatchMutuals, watchMutuals } from "./mutuals";
import { settings } from "./settings";
import { count, forgetFresh, hideFresh, hideServer, invalidate, isHidden, isLoaded, listNow, load, showServer, start, stop } from "./store";
import { About } from "./ui";

const guildCtx: NavContextMenuPatchCallback = (children, { guild }: { guild?: Guild; }) => {
    if (!guild?.id || !settings.store.guildMenu) return;

    const away = isHidden(guild.id);
    const Icon = away ? EyeIcon : EyeOffIcon;

    place(children, 20,
        <Menu.MenuItem
            id="vc-chs-server"
            key="vc-chs-server"
            label={away ? "Unhide Server" : "Hide Server"}
            icon={Icon}
            leadingAccessory={{ type: "icon", icon: Icon }}
            action={() => away ? showServer(guild.id) : hideServer(guild.id)}
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
const known = knownList("HideServers_Known", listNow);

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

/** A server joined or left while the plugin is on: seen, so not new next time */
const onListChange = () => known.rememberSoon();

migratePluginSettings("HideServers", "CustomPluginHideServers");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default definePlugin({
    name: "HideServers",
    description: "Hide servers from your server list. You stay in every one of them, nothing is left, and nobody is told.",
    tags: ["Servers", "Appearance", "Privacy"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    /** One line for Additional Settings: how many are hidden */
    hubSummary() {
        const n = count();
        return n ? `${plural(n, "server")} hidden` : "No servers hidden yet";
    },

    settingsAboutComponent: () => (
        <About
            icon={EyeOffIcon}
            title="Hide servers from your server list"
            steps={[
                <>Right-click a server and choose <strong>Hide Server</strong>.</>,
                <>You stay in it and still get its messages. It is just not shown in your server list.</>,
                <>Unhide any of them from the list below.</>
            ]}
        />
    ),

    contextMenus: {
        "guild-context": guildCtx
    },

    /** Told by Cloud Sync that the saved copy was replaced, so the next start reads it again */
    dataChanged: invalidate,

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
        start();
        watchMutuals();
        FluxDispatcher.subscribe("CONNECTION_OPEN", afterConnect);
        FluxDispatcher.subscribe("GUILD_CREATE", onListChange);
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
        FluxDispatcher.unsubscribe("GUILD_DELETE", onListChange);
        unwatchMutuals();
        // The bar goes back to how Discord has it; the list of what was hidden is kept.
        stop();
        known.giveBack(forgetFresh);
    }
});
