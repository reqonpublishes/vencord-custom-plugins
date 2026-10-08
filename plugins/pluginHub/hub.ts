/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { Flux } from "@webpack/common";

import {
    BellIcon, BoltIcon, ChatAddIcon, ChatIcon, CloudIcon, EyeOffIcon, IconComponent, InspectIcon, PersonOffIcon,
    PhoneAddIcon, ServerIcon
} from "./icons";

const logger = new Logger("PluginHub");

export type Section = "hide" | "fake" | "tools";

export interface Entry {
    /** the plugin's name, as Vencord knows it */
    plugin: string;
    /** the same name, written for reading */
    label: string;
    icon: IconComponent;
    section: Section;
    /** what the plugin is for, shown while it has nothing of its own to report */
    about: string;
    /** what you see instead while it is off */
    off: string;
}

export const SECTIONS: { id: Section; title: string; }[] = [
    { id: "hide", title: "Hide" },
    { id: "fake", title: "Fake" },
    { id: "tools", title: "Tools" }
];

/**
 * Every plugin this page looks after, in the order the right-click menus use.
 *
 * Hide and Fake are the ones that change what Discord shows you - and so the ones the
 * switch at the top is about. Turning one off puts the real thing back on screen and keeps
 * everything it was holding, which is what makes it a switch rather than a reset.
 */
export const ENTRIES: Entry[] = [
    { plugin: "HideMessages", label: "Hide Messages", icon: EyeOffIcon, section: "hide", about: "Hide messages, ranges or whole conversations", off: "Off. Every message is showing" },
    { plugin: "HideDMs", label: "Hide DMs", icon: ChatIcon, section: "hide", about: "Hide conversations from your DM list", off: "Off. Every DM is showing" },
    { plugin: "HideFriends", label: "Hide Friends", icon: PersonOffIcon, section: "hide", about: "Hide friends, or fake a relationship", off: "Off. Your real friends list is showing" },
    { plugin: "HideServers", label: "Hide Servers", icon: ServerIcon, section: "hide", about: "Hide servers from your server list", off: "Off. Every server is showing" },
    { plugin: "FakeMessages", label: "Fake Messages", icon: ChatAddIcon, section: "fake", about: "Add messages nobody sent", off: "Off. Only real messages are showing" },
    { plugin: "FakeCalls", label: "Fake Calls", icon: PhoneAddIcon, section: "fake", about: "Add calls that never happened", off: "Off. Only real calls are showing" },
    { plugin: "FakeNotifications", label: "Fake Notifications", icon: BellIcon, section: "fake", about: "Set the numbers on your badges", off: "Off. Badges show the real numbers" },
    { plugin: "InspectMessages", label: "Inspect Messages", icon: InspectIcon, section: "fake", about: "Change what a message says and when it was sent", off: "Off. Messages read as they really are" },
    { plugin: "CloudSync", label: "Cloud Sync", icon: CloudIcon, section: "tools", about: "Sync all of this with your phone", off: "Off" },
    { plugin: "QuickRestart", label: "Quick Restart", icon: BoltIcon, section: "tools", about: "Restart plugins in milliseconds", off: "Off. The restart shortcuts do nothing" }
];

/** Whether a plugin changes what Discord shows, rather than being a tool */
export const isView = (entry: Entry) => entry.section !== "tools";

/**
 * What a plugin has to say for itself right now - how much it is hiding or faking.
 *
 * Asked of the plugin rather than worked out here, so this page does not have to know how
 * any of them keep their lists.
 */
export function summaryOf(entry: Entry): string {
    try {
        return pluginOf(entry.plugin)?.hubSummary?.() || entry.about;
    } catch {
        return entry.about;
    }
}

// Through the global rather than imported: importing the plugin manager from a plugin is a
// circular dependency, and Vencord's own commons dodge it the same way.
const PM = (): any => (window as any).Vencord?.Plugins;

export const pluginOf = (name: string): any => PM()?.plugins?.[name];

/** Installed at all - somebody may have copied in only some of the folders */
export const installed = () => ENTRIES.filter(entry => !!pluginOf(entry.plugin));

export const isOn = (name: string) => !!pluginOf(name)?.started;

/**
 * Whether turning this on has to wait for Discord to restart.
 *
 * Only true of a plugin that works from inside Discord's own code and was off when Discord
 * loaded: that code can only be changed as it loads. One that was on at the time keeps its
 * changes in place and answers truthfully while stopped, so it switches like any other.
 */
export function needsRestart(name: string) {
    const plugin = pluginOf(name);
    if (!plugin?.patches?.length || plugin.started) return false;

    try {
        return plugin.patchesLive ? !plugin.patchesLive() : true;
    } catch {
        return true;
    }
}

/** The plugins switched off from this page. Kept across restarts, which is the point of it */
const offList = (): string[] => {
    const held = Settings.plugins.PluginHub?.off;
    return Array.isArray(held) ? held : [];
};

function remember(name: string, off: boolean) {
    const saved = Settings.plugins.PluginHub;
    if (!saved) return;

    const rest = offList().filter(other => other !== name);
    saved.off = off ? [...rest, name] : rest;
}

/**
 * Turn one plugin on or off, without Vencord being told it is off.
 *
 * As far as Vencord is concerned the plugin stays enabled. That matters for the ones that
 * work from inside Discord's own code: those changes can only go in while Discord loads, so
 * a plugin Vencord has down as disabled cannot be switched on later without a restart. Left
 * enabled and merely stopped, everything it needs is already in place and it comes back the
 * moment it is asked to.
 *
 * Stopping is enough to switch it off: each of these plugins puts the real thing back on
 * screen when it stops and keeps what it was holding. Which ones are off is written down
 * here, and they are stopped again every time Discord starts.
 */
export function setOn(name: string, on: boolean): "done" | "restart" | "failed" {
    const manager = PM();
    const plugin = pluginOf(name);
    const saved = Settings.plugins[name];
    if (!manager || !plugin || !saved) return "failed";

    try {
        if (!on) {
            if (plugin.started && !manager.stopPlugin(plugin)) return "failed";

            remember(name, true);
            return "done";
        }

        remember(name, false);
        if (plugin.started) return "done";

        // Only a plugin Vencord itself has switched off gets as far as needing a restart.
        const { restartNeeded, failures } = manager.startDependenciesRecursive(plugin);
        if (failures?.length) {
            logger.error(`Could not start what ${name} depends on`, failures);
            return "failed";
        }

        saved.enabled = true;
        if (restartNeeded || needsRestart(name)) return "restart";

        return manager.startPlugin(plugin) ? "done" : "failed";
    } catch (e) {
        logger.error(`Could not turn ${name} ${on ? "on" : "off"}`, e);
        return "failed";
    }
}

/**
 * Stop everything this page has switched off.
 *
 * Run once Discord has started its plugins: Vencord starts all the enabled ones, which
 * includes the ones only this page thinks are off.
 */
export function applyOffList() {
    const manager = PM();
    if (!manager) return;

    batched(() => {
        for (const name of offList()) {
            const plugin = pluginOf(name);
            if (!plugin?.started) continue;

            try {
                manager.stopPlugin(plugin);
            } catch (e) {
                logger.error(`Could not keep ${name} off`, e);
            }
        }
    });
}

/** Several plugins switched together are one redraw of Discord, not one each */
function batched(run: () => void) {
    const emitter = (Flux as any)?.Emitter;
    if (typeof emitter?.batched === "function") emitter.batched(run);
    else run();
}

/** The plugins that change what Discord shows and are doing so right now */
export const applying = () => installed().filter(entry => isView(entry) && isOn(entry.plugin)).map(entry => entry.plugin);

/**
 * See the real Discord, or go back to yours.
 *
 * Which plugins were on is written down before they go off, so coming back brings back those
 * and not every plugin you own. With nothing written down, on means all of them.
 */
export function flipAll(remembered: string[]): { on: boolean; changed: number; remember: string[]; restart: boolean; } {
    const live = applying();

    if (live.length) {
        let changed = 0;
        batched(() => {
            for (const name of live) if (setOn(name, false) === "done") changed++;
        });

        return { on: false, changed, remember: live, restart: false };
    }

    const views = installed().filter(isView).map(entry => entry.plugin);
    const back = remembered.filter(name => views.includes(name));

    let changed = 0;
    let restart = false;
    batched(() => {
        for (const name of back.length ? back : views) {
            const result = setOn(name, true);
            if (result === "done") changed++;
            if (result === "restart") restart = true;
        }
    });

    return { on: true, changed, remember: [], restart };
}
