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
        description: "Keeps everything hidden while you share your screen. Everything goes back when you stop.",
        default: true,
        onChange: () => refresh()
    },
    streamerMode: {
        type: OptionType.BOOLEAN,
        displayName: "Also when Streamer Mode is on",
        description: "Discord turns it on by itself when it sees OBS or another recorder.",
        default: true,
        onChange: () => refresh()
    },
    shareHideNew: {
        type: OptionType.BOOLEAN,
        displayName: "Hide anything new",
        description: "New friends, DMs and servers stay hidden until the share ends.",
        default: true,
        onChange: () => refresh()
    },
    shareHideMenus: {
        type: OptionType.BOOLEAN,
        displayName: "Hide right-click buttons",
        description: "No plugin buttons in menus, or the Bookmarked tab, while you share. Ctrl still shows them.",
        default: true,
        onChange: () => refresh()
    },
    shareHidePage: {
        type: OptionType.BOOLEAN,
        displayName: "Hide this page",
        description: "Takes Additional Settings out of the sidebar while you share.",
        default: false,
        onChange: () => refresh()
    },
    sharePlain: {
        type: OptionType.BOOLEAN,
        displayName: "Look like plain Discord",
        description: "Hides Vencord and turns off your other plugins while you share. The hide and fake plugins stay on.",
        default: false,
        onChange: () => refresh()
    },
    shareRestore: {
        type: OptionType.BOOLEAN,
        displayName: "Turn plugins back off after",
        description: "Plugins turned on for the share go back off when it ends.",
        default: true
    },
    // Plugins left alone during a share. Picked on the Additional Settings page.
    shareSkip: {
        type: OptionType.CUSTOM,
        default: [] as string[],
        onChange: () => refresh()
    },
    // When the plugins' right-click buttons show: "always", "ctrl" or "never". Chosen on the page.
    menuButtons: {
        type: OptionType.CUSTOM,
        default: "ctrl" as "always" | "ctrl" | "never",
        onChange: () => publishMenuMode()
    }
});

/**
 * Tell the other plugins when to show their right-click buttons.
 *
 * Left on the window, as the screen share is, so none of them depends on this one: with it
 * gone, the choice is gone and every button shows.
 */
export function publishMenuMode(on = true) {
    (window as any).vcMenuMode = on ? settings.store.menuButtons ?? "ctrl" : undefined;
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
    description: "Additional Settings under Vencord: every one of these plugins in one place, with Screen Share Protection.",
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
        // "shift" was the held key before Ctrl
        if ((settings.store.menuButtons as string) === "shift") settings.store.menuButtons = "ctrl";
        publishMenuMode();
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
        publishMenuMode(false);
        unwatch?.();
        unwatch = null;
        listed(false);
    }
});
