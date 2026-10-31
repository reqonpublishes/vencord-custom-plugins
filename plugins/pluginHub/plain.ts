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

/** The class prefixes of the plugins kept on for a share, whose things stay on screen */
const KEPT_PREFIXES = ["vc-chm", "vc-cim", "vc-cfm", "vc-chd", "vc-chf", "vc-chs", "vc-cfc", "vc-cfn", "vc-cip", "vc-cff", "vc-cfmod", "vc-hub"];

/**
 * What a turned-off plugin leaves behind on screen until Discord next draws that part.
 *
 * Turning a plugin off takes its buttons and icons out of Vencord's lists, but Discord only
 * asks those lists again when it redraws - so the chat bar keeps Translate until you type, and
 * the member list keeps its platform icons until it scrolls. Plugins that changed Discord's
 * code as it loaded (member counts, say) keep drawing until a restart, and a restart would
 * end the share. So what they draw is hidden for the share instead.
 *
 * Something a plugin draws itself leads with its `vc-` class; a plugin that only restyles one
 * of Discord's own (Plain Folder Icon on your folders) adds its class after Discord's, and
 * those are left alone - hiding them would hide the folder. Vencord's chat bar buttons carry
 * Discord's classes first, so they are named, and the few drawn with nothing of Vencord's at
 * all are named by what they say.
 *
 * Call Timer's line in the voice panel is one of those, and leaving it is worse than untidy:
 * the plugin's stylesheet, which lets the panel grow to fit an extra line, goes when the
 * plugin stops, while the timer stays - so the panel clipped "Voice Connected" and the timer
 * mid-call. Without the line the panel is Discord's own height again.
 *
 * The green timer on the row of the call you are in is Discord's own, not a plugin's, and goes
 * too: it is known by its role, the one stable thing about it.
 */
const ours = KEPT_PREFIXES.map(prefix => `[class^="${prefix}-"], [class*=" ${prefix}-"]`).join(", ");
const PLAIN_CSS = `
:is([class^="vc-"], .vc-chatbar-button):not(${ours}):not(:is(${ours}) *),
button[aria-label="Enable Game Activity"], button[aria-label="Disable Game Activity"],
section[class*="panels"] p[style*="--font-code"],
a :has(> [role="timer"]) {
    display: none !important;
}`;

let style: HTMLStyleElement | null = null;

function hideLeftovers(on: boolean) {
    if (on && !style) {
        style = document.createElement("style");
        style.id = "vc-hub-plain";
        style.textContent = PLAIN_CSS;
        document.head.append(style);
    } else if (!on && style) {
        style.remove();
        style = null;
    }
}

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

    hideLeftovers(true);

    const kept = new Set(ENTRIES.filter(isView).map(entry => entry.plugin));
    // and ours that draw nothing: Ctrl+R stays quick, chats keep loading
    kept.add("PluginHub").add("QuickRestart").add("Performance");
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
    hideLeftovers(false);

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
