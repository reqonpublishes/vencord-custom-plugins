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
import definePlugin, { OptionType, StartAt } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { FluxDispatcher, React, SelectedChannelStore, showToast } from "@webpack/common";

import { BoltIcon, PowerIcon, PuzzleIcon, RefreshIcon } from "./icons";
import { About, IconButton, Panel } from "./ui";

const logger = new Logger("QuickRestart");

const SELF = "QuickRestart";
const HUB = "PluginHub";


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

/** Set once a reload has been asked for: this window is on its way out */
let restarting = false;

/**
 * A normal reload, which keeps what Discord has already downloaded - new code, every plugin,
 * everything restarts.
 *
 * Not what Discord's own Ctrl+R does: its menu reloads ignoring the cache, which downloads the
 * whole app again. Measured on PTB: Discord's back in 2.8-4.1 s this way, 17.6 s or more that way.
 */
const reload = () => {
    restarting = true;
    location.reload();
};

/** When Discord drew itself after this window loaded, or 0 while it has not yet */
let drawnAt = 0;

function noteWhenDrawn() {
    const drawn = () => !!document.querySelector('[data-list-id="guildsnav"]');
    if (drawn()) {
        drawnAt = Date.now();
        return;
    }
    const watcher = new MutationObserver(() => {
        if (!drawn()) return;
        drawnAt = Date.now();
        watcher.disconnect();
    });
    watcher.observe(document, { childList: true, subtree: true });
}

/**
 * Ctrl+R and Ctrl+Shift+R both restart, the quick way, once.
 *
 * Caught before Discord sees them, so its slow reload never starts. Pressed again while Discord
 * is loading, or just after it is back, it is ignored: each extra press would otherwise throw
 * the load away and start again.
 */
function onKeyDown(e: KeyboardEvent) {
    if (!e.ctrlKey || e.altKey || e.metaKey || e.key.toLowerCase() !== "r") return;

    e.preventDefault();
    e.stopPropagation();
    if (e.repeat || restarting || !drawnAt || Date.now() - drawnAt < 1500) return;
    reload();
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
    buttons: {
        type: OptionType.COMPONENT,
        component: RestartButtons
    }
});

migratePluginSettings("QuickRestart", "CustomPluginQuickRestart", "CustomQuickRestart");

export default definePlugin({
    name: "QuickRestart",
    description: "Ctrl+R restarts Discord about five times faster: Discord's own Ctrl+R downloads the whole app again, this keeps what it already has. Pressing it again while it loads does nothing.",
    tags: ["Utility"],
    authors: [{ name: "reqon", id: 497562304498368513n }],

    settings,

    // At once, so Ctrl+R pressed while Discord is still loading is caught too.
    startAt: StartAt.Init,

    settingsAboutComponent: () => (
        <About
            icon={BoltIcon}
            title="Ctrl+R, five times faster"
            note={false}
            steps={[
                <>Press <kbd>Ctrl</kbd>+<kbd>R</kbd> (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>). Discord restarts for real, in about three seconds instead of fifteen or more.</>,
                <>Discord's own Ctrl+R downloads the whole app again every time. This keeps what it already has.</>,
                <>Pressing it again while Discord loads does nothing, so it never starts over.</>
            ]}
        />
    ),

    start() {
        window.addEventListener("keydown", onKeyDown, true);
        noteWhenDrawn();
        // An earlier version laid a picture over the window while it reloaded, from a helper
        // that lives until Discord is fully quit. Any picture it left is taken away at once.
        (VencordNative as any).pluginHelpers?.QuickRestart?.uncover?.()?.catch?.(() => { });
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
    }
});
