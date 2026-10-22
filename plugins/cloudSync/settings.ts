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

/**
 * Whether a plugin keeps what it holds on disk, which is the only place this reads and writes.
 *
 * With its "Keep after restart" off a plugin reads nothing back and writes nothing down, so a
 * fetch would land somewhere it never looks and a send would find nothing. Plugins without
 * that setting always keep theirs.
 */
export const isKept = (name: string) => (Settings.plugins[name] as any)?.persist !== false;

const off = (name: string) => () => !isPluginEnabled(name) || !isKept(name);

/** When a sync last went each way, and what it carried */
/** What can be synced, in the order the panel shows them */
export const PARTS: { key: string; plugin: string; label: string; }[] = [
    { key: "inspectMessages", plugin: "InspectMessages", label: "Inspect Messages" },
    { key: "hideMessages", plugin: "HideMessages", label: "Hide Messages" },
    { key: "hideDMs", plugin: "HideDMs", label: "Hide DMs" },
    { key: "hideFriends", plugin: "HideFriends", label: "Hide Friends" },
    { key: "hideServers", plugin: "HideServers", label: "Hide Servers" },
    { key: "fakeMessages", plugin: "FakeMessages", label: "Fake Messages" },
    { key: "fakeFriends", plugin: "FakeFriends", label: "Fake Friends" },
    { key: "fakeCalls", plugin: "FakeCalls", label: "Fake Calls" },
    { key: "fakeNotifications", plugin: "FakeNotifications", label: "Fake Notifications" },
];

export interface Last {
    at: number;
    what: string[];
}

export const settings = definePluginSettings({
    sync: {
        type: OptionType.COMPONENT,
        component: SyncPanel
    },
    // The sync code. Still called link because that is what older versions saved it as.
    // Edited from the panel above rather than as a row of its own, so it sits beside the
    // buttons that use it.
    link: {
        type: OptionType.STRING,
        description: "Your sync code",
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
        hidden: true,
        disabled: off("HideMessages"),
        displayName: "Hide Messages",
        description: "Sync hidden messages and hidden conversations",
        default: true
    },
    inspectMessages: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("InspectMessages"),
        displayName: "Inspect Messages",
        description: "Sync messages you changed",
        default: true
    },
    fakeMessages: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("FakeMessages"),
        displayName: "Fake Messages",
        description: "Sync fake messages",
        default: true
    },
    fakeCalls: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("FakeCalls"),
        displayName: "Fake Calls",
        description: "Sync fake calls",
        default: true
    },
    fakeNotifications: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("FakeNotifications"),
        displayName: "Fake Notifications",
        description: "Sync the badge numbers",
        default: true
    },
    hideDMs: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("HideDMs"),
        displayName: "Hide DMs",
        description: "Sync which DMs are hidden",
        default: true
    },
    hideFriends: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("HideFriends"),
        displayName: "Hide Friends",
        description: "Sync hidden friends and hidden requests",
        default: true
    },
    fakeFriends: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("FakeFriends"),
        displayName: "Fake Friends",
        description: "Sync fake friends, requests and blocks",
        default: true
    },
    hideServers: {
        type: OptionType.BOOLEAN,
        hidden: true,
        disabled: off("HideServers"),
        displayName: "Hide Servers",
        description: "Sync which servers are hidden",
        default: true
    }
});
