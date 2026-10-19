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
import { bringDown, sendUp } from "./sync";
import { About } from "./ui";

migratePluginSettings("CloudSync", "CustomPluginSync");

export default definePlugin({
    name: "CloudSync",
    description: "Sync these plugins between this computer and your phone through one private link. Nothing syncs until you press a button.",
    tags: ["Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={CloudIcon}
            title="Sync between your phone and this computer"
            note="Your data only goes to your own sync link. Nothing is sent to Discord."
            steps={[
                <>Make a link here, then paste the same link into <strong>Sync</strong> on your phone (or the other way round).</>,
                <><strong>Sync to Cloud</strong> uploads what this computer has. <strong>Sync from Cloud</strong> replaces it with what is in the cloud.</>,
                <>Nothing syncs by itself. It only happens when you press a button.</>
            ]}
        />
    ),

    // The two things the buttons do, by name - so a keybind, a script or another plugin can
    // send or fetch without the settings page being open.
    sendUp,
    bringDown
});
