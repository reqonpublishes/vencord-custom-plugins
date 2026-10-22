/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";

import { ENTRIES, isView } from "./hub";

const logger = new Logger("PluginHub");

/** The plugins this turned off for the share, so exactly those come back */
let stopped: string[] = [];
let realBuildLayout: any = null;

/** What the plugins kept on depend on, so it stays on too */
function neededByKept(PM: any, kept: Set<string>) {
    const needed = new Set<string>();
    for (const name of kept) for (const dep of PM.plugins[name]?.dependencies ?? []) needed.add(dep);
    return needed;
}

/**
 * Look like Discord with no Vencord at all, for the length of a share.
 *
 * Vencord's section of the settings sidebar is left out, and every other Vencord plugin is
 * turned off - all but the ones that hide and fake things, which the share needs on, and what
 * those depend on. Changes a plugin made to Discord's own code as it loaded stay until the
 * next restart; everything else it added goes with it.
 */
export function lookPlain() {
    const PM: any = (window as any).Vencord?.Plugins;
    if (!PM?.plugins) return;

    // the sidebar: Vencord builds its section here each time settings open
    const SettingsPlugin = PM.plugins.Settings;
    if (SettingsPlugin && !realBuildLayout) {
        realBuildLayout = SettingsPlugin.buildLayout;
        SettingsPlugin.buildLayout = function (builder: any) {
            return builder.buildLayout();
        };
    }

    const kept = new Set(ENTRIES.filter(isView).map(entry => entry.plugin));
    kept.add("PluginHub");
    const needed = neededByKept(PM, kept);

    for (const [name, plugin] of Object.entries<any>(PM.plugins)) {
        if (!plugin.started || plugin.required || kept.has(name) || needed.has(name) || name.endsWith("API")) continue;
        try {
            if (PM.stopPlugin(plugin)) stopped.push(name);
        } catch (e) {
            logger.error("Could not turn off " + name + " for the share", e);
        }
    }
}

/** The share is over: everything turned off for it comes back, and so does the sidebar */
export function lookNormal() {
    const PM: any = (window as any).Vencord?.Plugins;

    if (realBuildLayout && PM?.plugins?.Settings) PM.plugins.Settings.buildLayout = realBuildLayout;
    realBuildLayout = null;

    const names = stopped;
    stopped = [];
    for (const name of names) {
        try {
            const plugin = PM?.plugins?.[name];
            if (plugin && !plugin.started) PM.startPlugin(plugin);
        } catch (e) {
            logger.error("Could not turn " + name + " back on after the share", e);
        }
    }
}

/** Whether a share has things turned off right now */
export const lookingPlain = () => realBuildLayout !== null;
