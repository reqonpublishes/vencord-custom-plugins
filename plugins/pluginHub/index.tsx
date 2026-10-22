/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { definePluginSettings } from "@api/Settings";
import SettingsPlugin from "@plugins/_core/settings";
import { removeFromArray } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";

import { applyOffList } from "./hub";
import HubPage from "./HubPage";
import { TuneIcon } from "./icons";
import { onProtectionChange, pageHidden, refresh, startProtection, stopProtection } from "./protect";
import { About } from "./ui";

const KEY = "vencord_additional_settings";

export const settings = definePluginSettings({
    // Which plugins were on when Show Real was pressed, so Turn Back On brings back those
    // and not every plugin there is.
    paused: {
        type: OptionType.CUSTOM,
        default: [] as string[]
    },
    // Which plugins are switched off from this page. Vencord still has them as enabled, so
    // they are stopped again on every start rather than never loaded.
    off: {
        type: OptionType.CUSTOM,
        default: [] as string[]
    },
    shareProtection: {
        type: OptionType.BOOLEAN,
        displayName: "Screen Share Protection",
        description: "While you share your screen, every plugin is switched on, including the ones you turned off, and their menu entries and this page are kept out of sight. Everything goes back to how you had it when you stop.",
        default: true,
        onChange: () => refresh()
    },
    streamerMode: {
        type: OptionType.BOOLEAN,
        displayName: "Also when Streamer Mode is on",
        description: "Discord can turn Streamer Mode on by itself when it sees OBS or another recorder.",
        default: true,
        onChange: () => refresh()
    },
    shareHideNew: {
        type: OptionType.BOOLEAN,
        displayName: "Hide new friends, DMs and servers",
        description: "Anything that appeared since those plugins were last on is hidden while you share, and shown again after. Your hidden lists don't change.",
        default: true,
        onChange: () => refresh()
    },
    shareHideMenus: {
        type: OptionType.BOOLEAN,
        displayName: "Hide plugin menus",
        description: "Removes these plugins' right-click entries and the Bookmarked tab while you share. Hold Shift to see the entries anyway.",
        default: true,
        onChange: () => refresh()
    },
    shareHidePage: {
        type: OptionType.BOOLEAN,
        displayName: "Hide this page",
        description: "Removes Additional Settings from the settings sidebar while you share.",
        default: true,
        onChange: () => refresh()
    },
    shareRestore: {
        type: OptionType.BOOLEAN,
        displayName: "Turn them off when sharing stops",
        description: "Plugins turned on for the share go back off. Turn this off to keep them on.",
        default: true
    },
    // Plugins left alone during a share. Picked on the Additional Settings page.
    shareSkip: {
        type: OptionType.CUSTOM,
        default: [] as string[],
        onChange: () => refresh()
    },
    // Plugins whose right-click entries are hidden. Switched on the Additional Settings page.
    hiddenMenus: {
        type: OptionType.CUSTOM,
        default: [] as string[],
        onChange: () => publishHiddenMenus()
    }
});

/**
 * Tell the other plugins whose right-click entries to leave out.
 *
 * Left on the window, as the screen share is, so none of them depends on this one: with it
 * gone, the list is gone and every entry is back.
 */
export function publishHiddenMenus(on = true) {
    (window as any).vcHiddenMenus = on ? [...(settings.store.hiddenMenus ?? [])] : [];
}

/** Put this page in Discord's settings sidebar, or take it out */
function listed(on: boolean) {
    removeFromArray(SettingsPlugin.customEntries, entry => entry.key === KEY);

    if (on) {
        SettingsPlugin.customEntries.push({
            key: KEY,
            title: "Additional Settings",
            Component: HubPage,
            Icon: TuneIcon
        });
    }
}

/**
 * A page listing everything that is hidden and faked is the last thing to have in the
 * sidebar of a shared screen, so it is taken out while one is being shared.
 */
let unwatch: (() => void) | null = null;

/** The wait before the off list is applied, kept so stopping first can call it off */
let pending: ReturnType<typeof setTimeout> | null = null;

export default definePlugin({
    name: "PluginHub",
    description: "Adds Additional Settings under Vencord: every one of these plugins in one place, each with its own switch, plus one button to see the real Discord.",
    tags: ["Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={TuneIcon}
            title="All of these plugins in one place"
            note={false}
            steps={[
                <>Open Discord's settings and look under <strong>Vencord</strong> for <strong>Additional Settings</strong>.</>,
                <>Turn a plugin off there to see the real thing, and on again to get your version back. Nothing is forgotten.</>,
                <><strong>Show Real</strong> turns them all off at once.</>,
                <><strong>Screen Share Protection</strong> switches them all back on while you share your screen.</>
            ]}
        />
    ),

    start() {
        listed(true);
        publishHiddenMenus();
        unwatch = onProtectionChange(() => listed(!pageHidden()));

        // After this turn of the loop, by which time Vencord has started every plugin it is
        // going to - including the ones that are meant to be off.
        pending = setTimeout(() => {
            pending = null;
            applyOffList();
            // After the off list, so a share already running when Discord loads is seen with
            // the plugins in the state they are meant to be in.
            startProtection();
        }, 0);
    },

    stop() {
        // Stopped before it got going: nothing is to start watching for shares afterwards.
        if (pending) clearTimeout(pending);
        pending = null;

        stopProtection();
        publishHiddenMenus(false);
        unwatch?.();
        unwatch = null;
        listed(false);
    }
});
