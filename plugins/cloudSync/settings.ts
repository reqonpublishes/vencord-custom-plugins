/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings, Settings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { SyncPanel } from "./SyncPanel";

/**
 * Whether Vencord has a plugin switched on. A disabled one has nothing to sync, so its
 * switch here is greyed out rather than left looking as if it does something.
 */
export const isPluginEnabled = (name: string) => !!Settings.plugins[name]?.enabled;

const off = (name: string) => () => !isPluginEnabled(name);

/** When a sync last went each way, and what it carried */
export interface Last {
    at: number;
    what: string[];
}

export const settings = definePluginSettings({
    sync: {
        type: OptionType.COMPONENT,
        component: SyncPanel
    },
    // Edited from the panel above rather than as a row of its own, so the link sits beside
    // the buttons that use it.
    link: {
        type: OptionType.STRING,
        description: "Your sync link",
        default: "",
        hidden: true
    },
    lastUp: {
        type: OptionType.CUSTOM,
        default: null as Last | null
    },
    lastDown: {
        type: OptionType.CUSTOM,
        default: null as Last | null
    },
    hideMessages: {
        type: OptionType.BOOLEAN,
        disabled: off("HideMessages"),
        displayName: "Hide Messages",
        description: "Sync hidden messages and hidden conversations",
        default: true
    },
    inspectMessages: {
        type: OptionType.BOOLEAN,
        disabled: off("InspectMessages"),
        displayName: "Inspect Messages",
        description: "Sync messages you changed",
        default: true
    },
    fakeMessages: {
        type: OptionType.BOOLEAN,
        disabled: off("FakeMessages"),
        displayName: "Fake Messages",
        description: "Sync fake messages",
        default: true
    },
    fakeCalls: {
        type: OptionType.BOOLEAN,
        disabled: off("FakeCalls"),
        displayName: "Fake Calls",
        description: "Sync fake calls",
        default: true
    },
    fakeNotifications: {
        type: OptionType.BOOLEAN,
        disabled: off("FakeNotifications"),
        displayName: "Fake Notifications",
        description: "Sync the badge numbers",
        default: true
    },
    hideDMs: {
        type: OptionType.BOOLEAN,
        disabled: off("HideDMs"),
        displayName: "Hide DMs",
        description: "Sync which DMs are hidden",
        default: true
    },
    hideFriends: {
        type: OptionType.BOOLEAN,
        disabled: off("HideFriends"),
        displayName: "Hide Friends",
        description: "Sync hidden friends, fake blocks and fake requests",
        default: true
    },
    hideServers: {
        type: OptionType.BOOLEAN,
        disabled: off("HideServers"),
        displayName: "Hide Servers",
        description: "Sync which servers are hidden",
        default: true
    }
});
