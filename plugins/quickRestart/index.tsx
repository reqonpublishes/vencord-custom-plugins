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

// ---------------------------------------------------------------- the three restarts

/**
 * Reload the window. This is what Ctrl+R has always done, and on the desktop client it
 * rebuilds the renderer only, so your session and gateway connection are picked straight
 * back up rather than re-established.
 */
const reload = () => location.reload();

/**
 * Restart Vencord's plugins where they stand, without touching the page.
 *
 * This is the fast one, and it is fast because nothing is thrown away: no bundle is parsed
 * again, no connection is dropped, the message you were typing is still there. It is the
 * right tool for the thing people actually reload for, which is making a plugin or a
 * setting take effect.
 *
 * Plugins that patch Discord's own code are left alone. Their patches were applied to
 * modules as those modules first loaded, so re-running start() would not re-apply them;
 * only a real reload can. Reporting them is more honest than pretending they restarted.
 */
function softRestart() {
    // Reached through the global rather than imported. Importing the plugin manager from a
    // plugin is a circular dependency by definition, and Vencord's own webpack commons
    // dodge it the same way.
    const PM: any = Vencord?.Plugins;
    if (!PM?.plugins) return null;

    const began = performance.now();
    const restarted: string[] = [];
    const patched: string[] = [];
    const failed: string[] = [];

    for (const name in PM.plugins) {
        const plugin = PM.plugins[name];

        if (!PM.isPluginEnabled(name)) continue;
        if (PM.pluginRequiresRestart(plugin)) {
            patched.push(name);
            continue;
        }

        try {
            PM.stopPlugin(plugin);
            PM.startPlugin(plugin);
            restarted.push(name);
        } catch (e) {
            failed.push(name);
            logger.error(`Failed to restart ${name}`, e);
        }
    }

    return { restarted, patched, failed, ms: Math.round(performance.now() - began) };
}

// bottom of the screen, out of the way of whatever you were doing when you hit the key
const toast = (message: string, type: string) =>
    showToast(message, type, { position: Toasts.Position.BOTTOM });

/** Soft restart plus the bit that tells you what it managed to do */
function softRestartWithFeedback() {
    const result = softRestart();

    if (!result) {
        toast("Couldn't reach the plugin manager - reloading instead", Toasts.Type.FAILURE);
        reload();
        return;
    }

    const { restarted, patched, failed, ms } = result;

    if (failed.length) {
        toast(`Restarted ${restarted.length}, but ${failed.length} failed - see the console`, Toasts.Type.FAILURE);
        return;
    }

    if (!restarted.length) {
        // every enabled plugin patches Discord, so there was nothing a soft restart could
        // have done. Say so rather than flashing a cheerful toast that changed nothing.
        toast("Nothing here can be restarted without a reload", Toasts.Type.MESSAGE);
        return;
    }

    const rest = patched.length ? `, ${patched.length} need a reload` : "";
    toast(`Restarted ${restarted.length} plugin${restarted.length === 1 ? "" : "s"} in ${ms}ms${rest}`, Toasts.Type.SUCCESS);
}

function runAction() {
    switch (settings.store.action) {
        case "soft": return softRestartWithFeedback();
        case "full": return relaunch();
        default: return reload();
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

// parsed once per change rather than on every keypress
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
    if (matches(e, settings.store.softHotkey)) {
        e.preventDefault();
        e.stopPropagation();
        softRestartWithFeedback();
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
            <Button size="small" onClick={softRestartWithFeedback}>
                Restart plugins
            </Button>
            <Button variant="secondary" size="small" onClick={reload}>
                Reload window
            </Button>
            <Button variant="secondary" size="small" onClick={relaunch}>
                Full restart
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
            { label: "Reload the window - about a second, same as Ctrl+R always did", value: "reload", default: true },
            { label: "Restart plugins only - instant", value: "soft" },
            { label: "Restart Discord completely - several seconds", value: "full" }
        ]
    },
    softHotkey: {
        type: OptionType.STRING,
        description: "Second shortcut, always a plugin-only restart",
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
    name: "CustomPluginQuickRestart",
    description: "Restart Discord from a shortcut. Ctrl+R reloads the window the way it always did; Ctrl+Shift+R restarts just the plugins, which is instant and keeps your connection and your half-typed message.",
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
