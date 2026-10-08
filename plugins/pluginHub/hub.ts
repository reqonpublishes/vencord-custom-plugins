/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";

import {
    BellIcon, BoltIcon, ChatAddIcon, ChatIcon, CloudIcon, EyeOffIcon, IconComponent, InspectIcon, PersonOffIcon,
    PhoneAddIcon, ServerIcon
} from "./icons";

const logger = new Logger("PluginHub");

export interface Entry {
    /** the plugin's name, as Vencord knows it */
    plugin: string;
    /** the same name, written for reading */
    label: string;
    icon: IconComponent;
    /** what you see while it is on, and what you see instead while it is off */
    on: string;
    off: string;
    /** whether it changes what Discord shows, rather than being a tool */
    view: boolean;
}

/**
 * Every plugin this page looks after.
 *
 * The ones marked as a view are the ones that change what Discord shows you - and so the
 * ones the switch at the top is about. Turning one off puts the real thing back on screen
 * and keeps everything it was holding, which is what makes it a switch rather than a reset.
 */
export const ENTRIES: Entry[] = [
    { plugin: "HideMessages", label: "Hide Messages", icon: EyeOffIcon, on: "Hidden messages are hidden", off: "Every message is showing", view: true },
    { plugin: "InspectMessages", label: "Inspect Messages", icon: InspectIcon, on: "Changed messages show your version", off: "Messages show as they really are", view: true },
    { plugin: "FakeMessages", label: "Fake Messages", icon: ChatAddIcon, on: "Fake messages are showing", off: "Only real messages are showing", view: true },
    { plugin: "FakeCalls", label: "Fake Calls", icon: PhoneAddIcon, on: "Fake calls are showing", off: "Only real calls are showing", view: true },
    { plugin: "FakeNotifications", label: "Fake Notifications", icon: BellIcon, on: "Badges show your numbers", off: "Badges show the real numbers", view: true },
    { plugin: "HideDMs", label: "Hide DMs", icon: ChatIcon, on: "Hidden DMs are hidden", off: "Every DM is showing", view: true },
    { plugin: "HideFriends", label: "Hide Friends", icon: PersonOffIcon, on: "Hidden and fake friends apply", off: "Your real friends list is showing", view: true },
    { plugin: "HideServers", label: "Hide Servers", icon: ServerIcon, on: "Hidden servers are hidden", off: "Every server is showing", view: true },
    { plugin: "CloudSync", label: "Cloud Sync", icon: CloudIcon, on: "Ready to sync with your phone", off: "Sync is switched off", view: false },
    { plugin: "QuickRestart", label: "Quick Restart", icon: BoltIcon, on: "Restart shortcuts are active", off: "Restart shortcuts are off", view: false }
];

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

/**
 * Turn one plugin on or off, the way Vencord's own switch does.
 *
 * Stop and start are the whole of it: each of these plugins puts the real thing back on
 * screen when it stops and keeps what it was holding, so off means "show me the truth" and
 * on means "apply it again", with nothing lost either way.
 */
export function setOn(name: string, on: boolean): "done" | "restart" | "failed" {
    const manager = PM();
    const plugin = pluginOf(name);
    const saved = Settings.plugins[name];
    if (!manager || !plugin || !saved) return "failed";

    if (on === !!plugin.started) {
        saved.enabled = on;
        return "done";
    }

    try {
        if (on) {
            const { restartNeeded, failures } = manager.startDependenciesRecursive(plugin);
            if (failures?.length) {
                logger.error(`Could not start what ${name} depends on`, failures);
                return "failed";
            }

            if (restartNeeded || needsRestart(name)) {
                saved.enabled = true;
                return "restart";
            }
        }

        const worked = on ? manager.startPlugin(plugin) : manager.stopPlugin(plugin);
        if (!worked) return "failed";

        saved.enabled = on;
        return "done";
    } catch (e) {
        logger.error(`Could not turn ${name} ${on ? "on" : "off"}`, e);
        return "failed";
    }
}

/** The plugins that change what Discord shows and are doing so right now */
export const applying = () => installed().filter(entry => entry.view && isOn(entry.plugin)).map(entry => entry.plugin);

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
        for (const name of live) if (setOn(name, false) === "done") changed++;

        return { on: false, changed, remember: live, restart: false };
    }

    const views = installed().filter(entry => entry.view).map(entry => entry.plugin);
    const back = remembered.filter(name => views.includes(name));

    let changed = 0;
    let restart = false;
    for (const name of back.length ? back : views) {
        const result = setOn(name, true);
        if (result === "done") changed++;
        if (result === "restart") restart = true;
    }

    return { on: true, changed, remember: [], restart };
}
