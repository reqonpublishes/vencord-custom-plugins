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
                <><strong>Show Real</strong> turns them all off at once.</>
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
        setTimeout(applyOffList, 0);
    },

    stop() {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === KEY);
    }
});
