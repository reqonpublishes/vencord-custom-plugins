/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";

import { definePluginSettings, migratePluginSettings, Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";
import definePlugin, { OptionType } from "@utils/types";
import { showToast } from "@webpack/common";

import { BoltIcon, PowerIcon, PuzzleIcon, RefreshIcon } from "./icons";
import { About, IconButton, Panel } from "./ui";

const logger = new Logger("QuickRestart");

const SELF = "QuickRestart";
const HUB = "PluginHub";

/**
 * Whether a plugin that is enabled but not running can only be brought in by a reload.
 *
 * Enabled and stopped is not enough to say so. Additional Settings stops plugins it has
 * switched off while Vencord still has them enabled, and those are off on purpose - a reload
 * starts them and they are stopped again straight after. What a reload really answers is a
 * plugin whose patches never went in, so only that is counted.
 */
function unpatched(name: string, plugin: any): boolean {
    const off: unknown = (Settings.plugins[HUB] as any)?.off;
    if (Array.isArray(off) && off.includes(name)) return false;

    if (!plugin.patches?.length) return false;

    try {
        // Plugins that know whether their patches went in say so; anything else with patches
        // that is not running is taken to be waiting on them.
        return plugin.patchesLive ? !plugin.patchesLive() : true;
    } catch {
        return true;
    }
}

// ---------------------------------------------------------------- the restarts

/**
 * Reload the window. What Ctrl+R has always done: on the desktop client it rebuilds the
 * renderer only, so the session and gateway connection are picked back up rather than
 * re-established.
 */
const reload = () => location.reload();

interface QuickResult {
    restarted: number;
    failed: string[];
    /** enabled, but never started - only a reload can bring these in */
    needsReload: string[];
    ms: number;
}

/**
 * Restart every plugin that is currently running.
 *
 * Vencord's stop/start pair is a complete lifecycle cycle - commands, context menus, flux
 * subscriptions, styles, badges, listeners, chat bar buttons, decorations, all torn down
 * and registered again. It is the same pair the settings page uses when you toggle a
 * plugin. So this covers everything a reload would, bar one thing: webpack patches, which
 * were applied to Discord's modules as those modules first loaded and cannot be redone
 * without loading them again.
 *
 * That distinction matters, and getting it wrong is what made this useless before. A
 * plugin that *has* patches restarts perfectly well - its patches are already in place and
 * stay there. It is a plugin that has been switched on since the last load whose patches
 * were never applied, and no amount of restarting will change that. Those are reported
 * separately rather than silently skipped.
 */
function quickRestart(): QuickResult | null {
    // Reached through the global rather than imported: importing the plugin manager from a
    // plugin is a circular dependency by definition, and Vencord's own webpack commons
    // dodge it the same way.
    const PM: any = Vencord?.Plugins;
    if (!PM?.plugins) return null;

    const began = performance.now();

    const running: any[] = [];
    const needsReload: string[] = [];

    for (const name in PM.plugins) {
        const plugin = PM.plugins[name];

        // The API plugins everything else is built on. Cycling those buys nothing and
        // takes the ground out from under the plugins being restarted around them.
        if (plugin.required) continue;

        // Restarting the thing currently running the restart is asking for trouble, and
        // there's no reason to: every setting here is read fresh at the keypress.
        if (name === SELF) continue;

        // Plugin Hub holds Screen Share Protection. Stopping it lets go of everything held on
        // for a share and starting it takes hold again a moment later - long enough for the
        // real lists to be on the stream in between. Its settings are read fresh as well.
        if (name === HUB) continue;

        if (plugin.started) running.push(plugin);
        else if (PM.isPluginEnabled(name) && unpatched(name, plugin)) needsReload.push(name);
    }

    // Stopped in reverse and started in order - the order Vencord itself uses - so nothing
    // is left running while something it depends on is down.
    for (let i = running.length - 1; i >= 0; i--) {
        try {
            PM.stopPlugin(running[i]);
        } catch (e) {
            logger.error(`Failed to stop ${running[i].name}`, e);
        }
    }

    const failed: string[] = [];
    for (const plugin of running) {
        try {
            if (!PM.startPlugin(plugin)) failed.push(plugin.name);
        } catch (e) {
            failed.push(plugin.name);
            logger.error(`Failed to start ${plugin.name}`, e);
        }
    }

    return {
        restarted: running.length - failed.length,
        failed,
        needsReload,
        ms: Math.round(performance.now() - began)
    };
}

/** Bottom of the screen, out of the way of whatever you were doing when you hit the key */
const toast = (message: string, type: ToastKind) =>
    showToast({ text: message, variant: (type) === "failure" ? "critical" : (type) === "success" ? "success" : "default", position: "bottom" });

type ToastKind = "success" | "failure" | "message";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Restart the plugins, and say what happened */
function runQuick(fallBackToReload: boolean) {
    const result = quickRestart();

    if (!result) {
        toast("Couldn't reach the plugin manager - reloading instead", "failure");
        reload();
        return;
    }

    // Plugins switched on since the last load are the one case a restart can't answer,
    // because their patches were never applied. Reloading is the only thing that will
    // help, so the sensible default is to just do it.
    if (result.needsReload.length && fallBackToReload) {
        reload();
        return;
    }

    if (result.failed.length) {
        toast(`Restarted ${result.restarted}, but ${plural(result.failed.length, "plugin")} failed - see the console`, "failure");
        return;
    }

    if (result.needsReload.length) {
        const waiting = result.needsReload.length;
        toast(`Restarted ${plural(result.restarted, "plugin")} - ${plural(waiting, "plugin")} still ${waiting === 1 ? "needs" : "need"} a reload`, "message");
        return;
    }

    toast(`Restarted ${plural(result.restarted, "plugin")} in ${result.ms}ms`, "success");
}

function runAction() {
    switch (settings.store.action) {
        case "quick": return runQuick(false);
        case "reload": return reload();
        case "full": return relaunch();
        default: return runQuick(true);
    }
}

// ---------------------------------------------------------------- hotkeys

interface Combo {
    key: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}

function parseHotkey(value: string): Combo {
    const parts = value.toLowerCase().split("+").map(part => part.trim()).filter(Boolean);
    const key = parts.pop() ?? "";

    return {
        key,
        ctrl: parts.includes("ctrl") || parts.includes("control"),
        shift: parts.includes("shift"),
        alt: parts.includes("alt"),
        meta: parts.includes("meta") || parts.includes("cmd") || parts.includes("super")
    };
}

// parsed once per distinct setting rather than on every keypress
const cache = new Map<string, Combo>();
function hotkey(raw: string) {
    let combo = cache.get(raw);
    if (!combo) cache.set(raw, combo = parseHotkey(raw));

    return combo;
}

function matches(e: KeyboardEvent, raw: string) {
    const combo = hotkey(raw);
    if (!combo.key || e.key.toLowerCase() !== combo.key) return false;

    // every modifier has to match exactly, so Ctrl+R doesn't also fire on Ctrl+Shift+R
    return e.ctrlKey === combo.ctrl && e.shiftKey === combo.shift
        && e.altKey === combo.alt && e.metaKey === combo.meta;
}

/**
 * Listened for in the capture phase.
 *
 * Discord binds its own shortcuts on the way up and stops some of them there, and the
 * message box swallows keys of its own. Going first means the shortcut works from wherever
 * you happen to be - mid-message, inside a modal, in the settings you just changed.
 */
function onKeyDown(e: KeyboardEvent) {
    if (matches(e, settings.store.reloadHotkey)) {
        e.preventDefault();
        e.stopPropagation();
        reload();
        return;
    }

    if (matches(e, settings.store.hotkey)) {
        e.preventDefault();
        e.stopPropagation();
        runAction();
    }
}

// ---------------------------------------------------------------- settings

function RestartButtons() {
    return (
        <Panel
            title="Restart now"
            actions={
                <>
                    <IconButton icon={PuzzleIcon} onClick={() => runQuick(false)}>
                        Restart Plugins
                    </IconButton>
                    <IconButton icon={RefreshIcon} variant="secondary" onClick={reload}>
                        Reload Window
                    </IconButton>
                    <IconButton icon={PowerIcon} variant="secondary" onClick={relaunch}>
                        Restart Discord
                    </IconButton>
                </>
            }
        />
    );
}

const settings = definePluginSettings({
    hotkey: {
        type: OptionType.STRING,
        displayName: "Restart shortcut",
        description: "The keys that restart your plugins, like ctrl+r.",
        default: "ctrl+r"
    },
    action: {
        type: OptionType.SELECT,
        displayName: "Shortcut action",
        description: "What happens when you press the restart shortcut.",
        options: [
            { label: "Restart plugins, reloading only if it has to", value: "smart", default: true },
            { label: "Restart plugins, never reload", value: "quick" },
            { label: "Reload the window", value: "reload" },
            { label: "Restart Discord completely", value: "full" }
        ]
    },
    reloadHotkey: {
        type: OptionType.STRING,
        displayName: "Reload shortcut",
        description: "Keys that always reload the whole window, like ctrl+shift+r.",
        default: "ctrl+shift+r"
    },
    buttons: {
        type: OptionType.COMPONENT,
        component: RestartButtons
    }
});

migratePluginSettings("QuickRestart", "CustomPluginQuickRestart", "CustomQuickRestart");

export default definePlugin({
    name: SELF,
    description: "Ctrl+R restarts your plugins in milliseconds, keeping your connection and anything you were typing. It only reloads the window when it has to. Ctrl+Shift+R always reloads.",
    tags: ["Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    settingsAboutComponent: () => (
        <About
            icon={BoltIcon}
            title="Restart in milliseconds"
            note={false}
            steps={[
                <><kbd>Ctrl</kbd>+<kbd>R</kbd> restarts every running plugin in place. You stay connected and keep what you were typing.</>,
                <>If a change really needs a reload, it reloads by itself.</>,
                <><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> always reloads the whole window.</>
            ]}
        />
    ),

    start() {
        window.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
    }
});
