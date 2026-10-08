/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import { Button } from "@components/Button";
import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";
import { openPluginModal } from "@components/settings/tabs/plugins/PluginModal";
import { Switch } from "@components/Switch";
import { Logger } from "@utils/Logger";
import { React, showToast } from "@webpack/common";

import { settings } from ".";
import { applying, Entry, flipAll, installed, isOn, needsRestart, pluginOf, setOn } from "./hub";
import { CloudDownIcon, CloudUpIcon, EyeIcon, EyeOffIcon, GearIcon, RefreshIcon } from "./icons";
import { cl, IconButton } from "./ui";

const logger = new Logger("PluginHub");

function PluginRow({ entry, onChange }: { entry: Entry; onChange(): void; }) {
    const { plugin, label, icon: Icon } = entry;
    const on = isOn(plugin);
    const waiting = !on && Settings.plugins[plugin]?.enabled && needsRestart(plugin);

    return (
        <div className={cl("row", on ? "" : "row-off")}>
            <div className={cl("tile", on ? "" : "tile-off")}>
                <Icon height={20} width={20} />
            </div>
            <div className={cl("row-text")}>
                <div className={cl("row-name")}>{label}</div>
                <div className={cl("row-detail")}>
                    {waiting ? "Turns on when Discord restarts" : on ? entry.on : entry.off}
                </div>
            </div>
            <div className={cl("actions")}>
                <Button
                    size="iconOnly"
                    variant="secondary"
                    aria-label={`${label} settings`}
                    title={`${label} settings`}
                    onClick={() => openPluginModal(pluginOf(plugin))}
                >
                    <GearIcon height={18} width={18} />
                </Button>
                <Switch
                    checked={on || !!waiting}
                    onChange={next => {
                        const result = setOn(plugin, next);

                        if (result === "failed") showToast(`Could not turn ${label} ${next ? "on" : "off"}`, "failure");
                        if (result === "restart") showToast(`${label} turns on when Discord restarts`, "message");

                        onChange();
                    }}
                />
            </div>
        </div>
    );
}

/** Sync without going to find its settings: the two buttons, for whoever already has a link */
function SyncRow() {
    const sync = pluginOf("CloudSync");
    const [busy, setBusy] = React.useState<"" | "up" | "down">("");
    const { link } = Settings.plugins.CloudSync ?? {};

    if (!sync?.started) return null;

    const run = async (which: "up" | "down") => {
        setBusy(which);

        try {
            if (which === "up") {
                const { sent } = await sync.sendUp();
                Settings.plugins.CloudSync.lastUp = { at: Date.now(), what: sent };
                showToast("Synced to cloud", "success");
            } else {
                const { applied } = await sync.bringDown();
                Settings.plugins.CloudSync.lastDown = { at: Date.now(), what: applied };
                showToast("Synced from cloud", "success");
            }
        } catch (e) {
            showToast(e instanceof Error ? e.message : String(e), "failure");
            logger.error("Sync failed", e);
        } finally {
            setBusy("");
        }
    };

    return (
        <div className={cl("row")}>
            <div className={cl("row-text")}>
                <div className={cl("row-name")}>Sync with your phone</div>
                <div className={cl("row-detail")}>
                    {link ? "To Cloud uploads what is here. From Cloud replaces it." : "Make a sync link in Cloud Sync's settings first"}
                </div>
            </div>
            <div className={cl("actions")}>
                <IconButton icon={CloudUpIcon} disabled={!link || !!busy} onClick={() => run("up")}>
                    {busy === "up" ? "Syncing..." : "Sync to Cloud"}
                </IconButton>
                <IconButton icon={CloudDownIcon} variant="secondary" disabled={!link || !!busy} onClick={() => run("down")}>
                    {busy === "down" ? "Syncing..." : "Sync from Cloud"}
                </IconButton>
            </div>
        </div>
    );
}

function HubPage() {
    const [, redraw] = React.useState(0);
    const update = () => redraw(n => n + 1);

    const all = installed();
    const views = all.filter(entry => entry.view);
    const tools = all.filter(entry => !entry.view);
    const live = applying().length;
    const waiting = views.some(entry => !isOn(entry.plugin) && Settings.plugins[entry.plugin]?.enabled && needsRestart(entry.plugin));

    return (
        <SettingsTab>
            <div className={cl("page")}>
                <div className={cl("hero", live ? "" : "hero-real")}>
                    <div className={cl("tile", live ? "" : "tile-off")}>
                        {live ? <EyeOffIcon height={20} width={20} /> : <EyeIcon height={20} width={20} />}
                    </div>
                    <div className={cl("row-text")}>
                        <div className={cl("hero-title")}>
                            {live ? `${live} of ${views.length} plugins are changing what you see` : "You are seeing the real Discord"}
                        </div>
                        <div className={cl("row-detail")}>
                            {live
                                ? "Turn them off to see your real friends, messages, calls and servers. Nothing is forgotten."
                                : "Everything you hid or faked is kept, and comes back when you turn it on again."}
                        </div>
                    </div>
                    <IconButton
                        icon={live ? EyeIcon : EyeOffIcon}
                        variant={live ? "primary" : "secondary"}
                        onClick={() => {
                            const result = flipAll(settings.store.paused ?? []);
                            settings.store.paused = result.remember;
                            update();

                            showToast(
                                result.on
                                    ? `${result.changed} turned back on${result.restart ? ", the rest after a restart" : ""}`
                                    : `${result.changed} turned off. You are seeing the real Discord`,
                                "success"
                            );
                        }}
                    >
                        {live ? "Show Real" : "Turn Back On"}
                    </IconButton>
                </div>

                {waiting && (
                    <div className={cl("row")}>
                        <div className={cl("row-text")}>
                            <div className={cl("row-name")}>A restart is needed</div>
                            <div className={cl("row-detail")}>One plugin was off when Discord loaded and can only turn on as it loads.</div>
                        </div>
                        <IconButton icon={RefreshIcon} onClick={() => location.reload()}>Reload Now</IconButton>
                    </div>
                )}

                <div className={cl("group-title")}>What you see</div>
                <div className={cl("list")}>
                    {views.map(entry => <PluginRow key={entry.plugin} entry={entry} onChange={update} />)}
                </div>

                {!!tools.length && (
                    <>
                        <div className={cl("group-title")}>Tools</div>
                        <div className={cl("list")}>
                            {tools.map(entry => <PluginRow key={entry.plugin} entry={entry} onChange={update} />)}
                            <SyncRow />
                        </div>
                    </>
                )}
            </div>
        </SettingsTab>
    );
}

export default wrapTab(HubPage, "Additional Settings");
