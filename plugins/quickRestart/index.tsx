/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./shared.css";
import "./styles.css";

import { definePluginSettings, migratePluginSettings, Settings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";
import definePlugin, { OptionType, PluginNative, StartAt } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, React, SelectedChannelStore, showToast } from "@webpack/common";

import { BoltIcon, PowerIcon, PuzzleIcon, RefreshIcon } from "./icons";
import { About, IconButton, Panel } from "./ui";

const logger = new Logger("QuickRestart");

const SELF = "QuickRestart";
const HUB = "PluginHub";

/** Present once Discord has been fully restarted with this plugin in it - see native.ts */
const Native = (VencordNative as any).pluginHelpers?.QuickRestart as PluginNative<typeof import("./native")> | undefined;

/** Discord's own connection to its servers */
const Gateway = findByPropsLazy("getSocket");

// ---------------------------------------------------------------- what the last restart did

interface Last {
    at: number;
    plugins?: number;
    pluginMs?: number;
    resyncMs?: number;
    note?: string;
}

let last: Last | null = null;
const listeners = new Set<() => void>();
const record = (patch: Partial<Last>) => {
    last = { ...(last ?? { at: Date.now() }), ...patch };
    for (const listener of listeners) listener();
};

// ---------------------------------------------------------------- plugins that need a reload

/**
 * Whether a plugin that is enabled but not running can only be brought in by a reload.
 *
 * Additional Settings stops plugins it has switched off while Vencord still has them enabled,
 * and those are off on purpose. What a reload really answers is a plugin whose patches never
 * went in, so only that is counted.
 */
function unpatched(name: string, plugin: any): boolean {
    const off: unknown = (Settings.plugins[HUB] as any)?.off;
    if (Array.isArray(off) && off.includes(name)) return false;
    if (!plugin.patches?.length) return false;

    try {
        return plugin.patchesLive ? !plugin.patchesLive() : true;
    } catch {
        return true;
    }
}

// ---------------------------------------------------------------- the three kinds of restart

/** Reload the window: the only thing that brings in new code. About five seconds */
const reload = () => {
    // With the helper in place the window reloads under a picture of itself, so there is no
    // blank screen and no loading screen - see native.ts. Without it, a plain reload.
    if (Native?.reloadCovered) void Native.reloadCovered().catch(() => location.reload());
    else location.reload();
};

/**
 * Take the picture away once this window has drawn Discord again.
 *
 * Called as the plugin starts on every load: after a covered reload it is what reveals the new
 * window, and the rest of the time there is nothing to take away. Waited for until the server
 * list is on screen.
 */
function uncoverWhenDrawn() {
    if (!Native?.uncover) return;

    // Only the page is asked. Asking for the signed-in user this early failed or came back
    // empty, and the picture then stayed up until the main process gave up on it at fifteen
    // seconds - measured: Discord drawn at 5.5 s, picture gone at 15.2 s.
    //
    // Told the moment the list is added rather than looking every so often: Discord is busiest
    // drawing its first screen, and a timer then fired well over a second late.
    let done = false;
    const reveal = () => {
        if (done) return;
        done = true;
        watcher.disconnect();
        clearTimeout(giveUp);
        // At once, not after the next frames or a timer: the picture covers the window, and
        // Windows does not draw a covered window, so frames may not come; and timers run late
        // while Discord draws its first screen. The request crosses to the main process, by
        // which time the list has been painted.
        void Native.uncover().catch(() => { });
    };
    const drawn = () => !!document.querySelector('[data-list-id="guildsnav"]');

    const watcher = new MutationObserver(() => drawn() && reveal());
    const giveUp = setTimeout(reveal, 15000);
    if (drawn()) reveal();
    else watcher.observe(document, { childList: true, subtree: true });
}

/**
 * Restart every running plugin in place. Measured at under ten milliseconds for eighty-odd.
 *
 * Vencord's stop/start pair is a full lifecycle - commands, menus, subscriptions, styles,
 * listeners, all torn down and put back - the same pair its settings page uses. The one thing
 * it cannot redo is a webpack patch, which goes in as Discord's code loads; a plugin switched
 * on since then is reported as needing a reload rather than quietly left out.
 */
function restartPlugins() {
    const PM: any = Vencord?.Plugins;
    if (!PM?.plugins) return null;

    const began = performance.now();
    const running: any[] = [];
    const needsReload: string[] = [];

    for (const name in PM.plugins) {
        const plugin = PM.plugins[name];

        // The APIs everything else stands on, this plugin (which is running the restart), and
        // Additional Settings, which holds Screen Share Protection and would let go of it for
        // the moment in between.
        if (plugin.required || name === SELF || name === HUB) continue;

        if (plugin.started) running.push(plugin);
        else if (PM.isPluginEnabled(name) && unpatched(name, plugin)) needsReload.push(name);
    }

    // Stopped in reverse and started in order, as Vencord itself does
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

    return { restarted: running.length - failed.length, failed, needsReload, ms: performance.now() - began };
}

/** Whether you are in a call, which a fresh session would hang up */
const inCall = () => {
    try {
        return !!SelectedChannelStore.getVoiceChannelId();
    } catch {
        return false;
    }
};

/**
 * Have Discord fetch everything again, as it does on launch, without reloading the window.
 *
 * The session is forgotten and the connection closed and opened again, so the server answers
 * with a fresh start - every server, conversation, friend and setting - exactly what a launch
 * gets. Measured at about two and a half seconds, with the window and whatever you were typing
 * staying where they are. Not during a call: a new session would hang it up.
 */
function resync(): Promise<number | null> {
    const socket = Gateway?.getSocket?.();
    if (!socket?.isConnected?.() || inCall()) return Promise.resolve(null);

    const began = performance.now();

    return new Promise(resolve => {
        const done = (ms: number | null) => {
            FluxDispatcher.unsubscribe("CONNECTION_OPEN", onOpen);
            clearTimeout(giveUp);
            resolve(ms);
        };
        const onOpen = () => done(performance.now() - began);
        const giveUp = setTimeout(() => done(null), 20000);

        FluxDispatcher.subscribe("CONNECTION_OPEN", onOpen);

        try {
            socket.sessionId = null;
            socket.close(true);
            socket.connect();
        } catch (e) {
            logger.error("Could not resync", e);
            done(null);
        }
    });
}

// ---------------------------------------------------------------- saying what happened

const toast = (text: string, variant: "success" | "critical" | "default" = "default") =>
    showToast({ text, variant, position: "bottom" });

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const ms = (n: number) => n < 1000 ? `${Math.max(1, Math.round(n))} ms` : `${(n / 1000).toFixed(1)} s`;

/** Restart the plugins, then resync Discord unless told not to */
async function softRestart(withResync: boolean) {
    const result = restartPlugins();
    if (!result) {
        toast("Could not reach the plugins, reloading instead", "critical");
        reload();
        return;
    }

    record({ at: Date.now(), plugins: result.restarted, pluginMs: result.ms, resyncMs: undefined, note: undefined });

    if (result.failed.length) {
        toast(`${plural(result.failed.length, "plugin")} failed to restart: ${result.failed.join(", ")}`, "critical");
    }

    const restarted = `Restarted ${plural(result.restarted, "plugin")} in ${ms(result.ms)}`;

    if (!withResync) {
        toast(restarted, "success");
        return;
    }

    if (inCall()) {
        record({ note: "Discord was not resynced because you were in a call" });
        toast(`${restarted}. Not resyncing Discord during a call`, "success");
        return;
    }

    toast(`${restarted}. Resyncing Discord...`, "default");
    const took = await resync();

    if (took === null) {
        record({ note: "Discord could not be resynced" });
        toast("Plugins restarted, but Discord did not resync. Press Ctrl+Shift+R to reload", "critical");
        return;
    }

    record({ resyncMs: took });
    toast(`Restarted ${plural(result.restarted, "plugin")} in ${ms(result.ms)} and resynced Discord in ${ms(took)}`, "success");
}

/** When Ctrl+R was last pressed during a call, so a second press can confirm it */
let warnedInCall = 0;

/**
 * What the shortcut does: a real restart of Discord, every time - new code, plugins and all -
 * under a picture of the window so it never goes blank.
 *
 * It used to restart only the plugins when it judged nothing new was waiting, which was quick
 * but looked like nothing happened, and could not tell new code was waiting until Discord had
 * been fully restarted once. A reload is what people mean by restarting, so it always reloads.
 *
 * A reload leaves a call, so during one the first press only says so and a second press within
 * a few seconds goes ahead.
 */
function restart() {
    if (inCall() && Date.now() - warnedInCall > 4000) {
        warnedInCall = Date.now();
        toast("You're in a call. Press Ctrl+R again to restart, which leaves the call", "default");
        return;
    }
    reload();
}

const runAction = () => restart();

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

const cache = new Map<string, Combo>();
function hotkey(raw: string) {
    let combo = cache.get(raw);
    if (!combo) cache.set(raw, combo = parseHotkey(raw));
    return combo;
}

function matches(e: KeyboardEvent, raw: string) {
    const combo = hotkey(raw);
    if (!combo.key || e.key.toLowerCase() !== combo.key) return false;

    // every modifier has to match exactly, so Ctrl+R does not also fire on Ctrl+Shift+R
    return e.ctrlKey === combo.ctrl && e.shiftKey === combo.shift && e.altKey === combo.alt && e.metaKey === combo.meta;
}

/** Listened for first, so the shortcut works wherever you are - mid-message, in a modal, in settings */
function onKeyDown(e: KeyboardEvent) {
    if (matches(e, settings.store.hotkey)) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) void runAction();
    }
}

// ---------------------------------------------------------------- settings

function LastRestart() {
    const [, redraw] = React.useState(0);
    React.useEffect(() => {
        const listener = () => redraw(n => n + 1);
        listeners.add(listener);
        return () => void listeners.delete(listener);
    }, []);

    if (!last) return <div className="vc-qr-last">Nothing restarted yet since Discord opened.</div>;

    return (
        <div className="vc-qr-last">
            <div className="vc-qr-stats">
                {last.plugins !== undefined && (
                    <div className="vc-qr-stat">
                        <span className="vc-qr-stat-value">{ms(last.pluginMs ?? 0)}</span>
                        <span className="vc-qr-stat-label">to restart {plural(last.plugins, "plugin")}</span>
                    </div>
                )}
                {last.resyncMs !== undefined && (
                    <div className="vc-qr-stat">
                        <span className="vc-qr-stat-value">{ms(last.resyncMs)}</span>
                        <span className="vc-qr-stat-label">to resync Discord</span>
                    </div>
                )}
                <div className="vc-qr-stat">
                    <span className="vc-qr-stat-value">~5 s</span>
                    <span className="vc-qr-stat-label">a full reload, for comparison</span>
                </div>
            </div>
            {last.note && <div className="vc-qr-note">{last.note}.</div>}
        </div>
    );
}

function RestartButtons() {
    return (
        <Panel
            title="Restart now"
            actions={
                <>
                    <IconButton icon={BoltIcon} onClick={() => void softRestart(true)}>Restart and Resync</IconButton>
                    <IconButton icon={PuzzleIcon} variant="secondary" onClick={() => void softRestart(false)}>Plugins Only</IconButton>
                    <IconButton icon={RefreshIcon} variant="secondary" onClick={reload}>Reload</IconButton>
                    <IconButton icon={PowerIcon} variant="secondary" onClick={relaunch}>Restart Discord</IconButton>
                </>
            }
        >
            <LastRestart />
        </Panel>
    );
}

const settings = definePluginSettings({
    hotkey: {
        type: OptionType.STRING,
        displayName: "Restart shortcut",
        description: "Ctrl+R by default, replacing Discord's own reload.",
        default: "ctrl+r"
    },
    buttons: {
        type: OptionType.COMPONENT,
        component: RestartButtons
    }
});

migratePluginSettings("QuickRestart", "CustomPluginQuickRestart", "CustomQuickRestart");

export default definePlugin({
    name: "QuickRestart",
    description: "Ctrl+R restarts Discord the way it always did, but behind a picture of the window, so it never goes blank. In a call it asks you to press again first, so you are not hung up by accident.",
    tags: ["Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    // At once, rather than when Discord's code is ready: that is after Discord has drawn, so
    // the picture over a restart stayed up for a second and a half too long (measured). Nothing
    // started here needs Discord's code - only the page and the key presses.
    startAt: StartAt.Init,

    settingsAboutComponent: () => (
        <About
            icon={BoltIcon}
            title="Ctrl+R, without the flash"
            note={false}
            steps={[
                <>Press <kbd>Ctrl</kbd>+<kbd>R</kbd> like always. Discord restarts for real - new updates, every plugin, everything - while a picture of the window stays up, so you never see it go blank.</>,
                <>In a call the first press only warns you, because restarting leaves the call. Press again to go ahead.</>,
                <>The buttons below can restart just the plugins in a few milliseconds, or quit and reopen Discord.</>
            ]}
        />
    ),

    start() {
        window.addEventListener("keydown", onKeyDown, true);
        uncoverWhenDrawn();
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
    }
});
