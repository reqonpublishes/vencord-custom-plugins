/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { migratePluginSettings } from "@api/Settings";
import definePlugin from "@utils/types";

import { CloudIcon } from "./icons";
import { settings } from "./settings";
import { codeOf } from "./shelf";
import { bringDown, sendUp } from "./sync";
import { About } from "./ui";

migratePluginSettings("CloudSync", "CustomPluginSync");

export default definePlugin({
    name: "CloudSync",
    description: "Sync these plugins with your phone using one private code.",
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={CloudIcon}
            title="Sync between your phone and this computer"
            note="Your data only goes to the shelf your code opens. Nothing is sent to Discord."
            steps={[
                <>Make a code here, or type your own, then put the same code into <strong>Sync</strong> on your phone (or the other way round).</>,
                <><strong>Sync to Cloud</strong> uploads what this computer has. <strong>Sync from Cloud</strong> replaces it with what is in the cloud.</>,
                <>Nothing syncs by itself. It only happens when you press a button.</>
            ]}
        />
    ),

    // The two things the buttons do, by name - so a keybind, a script or another plugin can
    // send or fetch without the settings page being open.
    sendUp,
    bringDown,

    start() {
        // Older versions saved the whole link; only the code at its end is kept now.
        const held = settings.store.link ?? "";
        if (held && codeOf(held) !== held) settings.store.link = codeOf(held);
    }
});
