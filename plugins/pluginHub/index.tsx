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
import { check, startProtection, stopProtection } from "./protect";
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
        description: "While you share your screen, every plugin is switched on, including the ones you turned off. They go back to how you had them when you stop.",
        default: true,
        onChange: () => check()
    },
    streamerMode: {
        type: OptionType.BOOLEAN,
        displayName: "Also protect in Streamer Mode",
        description: "Counts Streamer Mode as sharing. Discord turns it on by itself when it detects OBS or another recorder, if you have that enabled in Streamer Mode's settings.",
        default: true,
        onChange: () => check()
    }
});

export default definePlugin({
    name: "PluginHub",
    description: "Adds Additional Settings under Vencord in Discord's settings: every one of these plugins in one place, each with an on/off switch, and one button to see the real Discord.",
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
        SettingsPlugin.customEntries.push({
            key: KEY,
            title: "Additional Settings",
            Component: HubPage,
            Icon: TuneIcon
        });

        // After this turn of the loop, by which time Vencord has started every plugin it is
        // going to - including the ones that are meant to be off.
        setTimeout(() => {
            applyOffList();
            // After the off list, so a share already running when Discord loads is seen with
            // the plugins in the state they are meant to be in.
            startProtection();
        }, 0);
    },

    stop() {
        stopProtection();
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === KEY);
    }
});
