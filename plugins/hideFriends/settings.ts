/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { HiddenList } from "./HiddenList";
import { startImplicit, stopImplicit } from "./implicit";
import { forgetSaved } from "./store";

/** Whether the plugin is running, so a setting changed while it is off waits for it to be on */
let running = false;

/** Told by the plugin as it starts and stops */
export function setRunning(on: boolean) {
    running = on;
    setImplicit(on && settings.store.hideImplicit !== false);
}

function setImplicit(on: boolean) {
    if (on && running) startImplicit();
    else stopImplicit();
}

export const settings = definePluginSettings({
    userMenu: {
        type: OptionType.BOOLEAN,
        displayName: "Show in the people menu",
        description: "Hide Friend and Fake Relationship show when you right-click someone.",
        default: true
    },
    hideNew: {
        type: OptionType.BOOLEAN,
        displayName: "Hide new friends when turned back on",
        description: "Friends and requests from while it was off are hidden too.",
        default: false
    },
    persist: {
        type: OptionType.BOOLEAN,
        displayName: "Keep after restart",
        description: "Hidden and faked friends stay after a restart.",
        default: true,
        // switching it off should not leave the old list sitting on disk
        onChange: (value: boolean) => void (value || forgetSaved())
    },
    hideImplicit: {
        type: OptionType.BOOLEAN,
        displayName: "Hide the Implicit tab",
        description: "Removes the Implicit tab ImplicitRelationships adds to Friends.",
        default: true,
        onChange: (value: boolean) => setImplicit(value)
    },
    people: {
        type: OptionType.COMPONENT,
        component: HiddenList
    }
});
