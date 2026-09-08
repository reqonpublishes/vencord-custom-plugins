/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { definePluginSettings, migratePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";
import definePlugin, { OptionType } from "@utils/types";
import { showToast, Toasts } from "@webpack/common";

const cl = classNameFactory("vc-qr-");
const logger = new Logger("CustomPluginQuickRestart");

const SELF = "CustomPluginQuickRestart";

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

        if (plugin.started) running.push(plugin);
        else if (PM.isPluginEnabled(name)) needsReload.push(name);
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

// bottom of the screen, out of the way of whatever you were doing when you hit the key
const toast = (message: string, type: string) =>
    showToast(message, type, { position: Toasts.Position.BOTTOM });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Restart the plugins, and say what happened */
function runQuick(fallBackToReload: boolean) {
    const result = quickRestart();

    if (!result) {
        toast("Couldn't reach the plugin manager - reloading instead", Toasts.Type.FAILURE);
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
        toast(`Restarted ${result.restarted}, but ${plural(result.failed.length, "plugin")} failed - see the console`, Toasts.Type.FAILURE);
        return;
    }

    if (result.needsReload.length) {
        toast(`Restarted ${result.restarted} - ${plural(result.needsReload.length, "plugin")} still needs a reload`, Toasts.Type.MESSAGE);
        return;
    }

    toast(`Restarted ${plural(result.restarted, "plugin")} in ${result.ms}ms`, Toasts.Type.SUCCESS);
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
        <div className={cl("buttons")}>
            <Button size="small" onClick={() => runQuick(false)}>
                Restart plugins
            </Button>
            <Button variant="secondary" size="small" onClick={reload}>
                Reload window
            </Button>
            <Button variant="secondary" size="small" onClick={relaunch}>
                Restart Discord
            </Button>
        </div>
    );
}

const settings = definePluginSettings({
    hotkey: {
        type: OptionType.STRING,
        description: "Main shortcut, written as modifiers and a key joined by +",
        default: "ctrl+r"
    },
    action: {
        type: OptionType.SELECT,
        description: "What the main shortcut does",
        options: [
            { label: "Restart plugins, reloading only if it has to", value: "smart", default: true },
            { label: "Restart plugins, never reload", value: "quick" },
            { label: "Reload the window", value: "reload" },
            { label: "Restart Discord completely", value: "full" }
        ]
    },
    reloadHotkey: {
        type: OptionType.STRING,
        description: "Second shortcut, always a full window reload",
        default: "ctrl+shift+r"
    },
    buttons: {
        type: OptionType.COMPONENT,
        description: "Restart right now",
        component: RestartButtons
    }
});

migratePluginSettings("CustomPluginQuickRestart", "CustomQuickRestart", "QuickRestart");

export default definePlugin({
    name: SELF,
    description: "A restart that takes milliseconds instead of seconds. Ctrl+R restarts every running plugin in place, keeping your connection and your half-typed message, and falls back to a real reload on the rare change that needs one. Ctrl+Shift+R always reloads.",
    tags: ["Utility"],
    authors: [{ name: "reqon", id: 0n }],

    settings,

    start() {
        window.addEventListener("keydown", onKeyDown, true);
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
    }
});
