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
import { Alerts, React } from "@webpack/common";

import { settings } from ".";
import { deleteAllData } from "./data";
import { applying, Entry, flipAll, installed, isEnabled, isOn, isView, needsRestart, pluginOf, SECTIONS, setOn, summaryOf, usable } from "./hub";
import { ChevronDownIcon, CloudDownIcon, CloudUpIcon, CursorIcon, EyeIcon, EyeOffIcon, GearIcon, IconComponent, MenuIcon, RefreshIcon, ScreenShareIcon, SyncIcon, TrashIcon, UndoIcon, WrenchIcon } from "./icons";
import { isProtecting, onProtectionChange, raisedForShare } from "./protect";
import { say } from "./say";
import { cl, IconButton } from "./ui";

const logger = new Logger("PluginHub");

/** Enabled in Vencord but waiting on a restart before it can do anything */
const isWaiting = (plugin: string) => !isOn(plugin) && isEnabled(plugin) && needsRestart(plugin);

function PluginRow({ entry, onChange, sub }: { entry: Entry; onChange(): void; sub?: boolean; }) {
    const { plugin, label, icon: Icon } = entry;
    const enabled = isEnabled(plugin);
    const on = enabled && isOn(plugin);
    const waiting = isWaiting(plugin);
    const tag = on ? summaryOf(entry) : "";

    return (
        <div className={sub ? cl("sub-row", on ? "" : "item-off") : cl("item", on ? "" : "item-off")}>
            {sub
                ? <Icon className={cl("sub-icon")} height={18} width={18} />
                : <div className={cl("tile")}><Icon height={20} width={20} /></div>}
            <div className={cl("item-text")}>
                <div className={cl(sub ? "sub-name" : "item-name")}>{label}</div>
                <div className={cl("item-detail")}>
                    {waiting ? "Turns on after a reload." : pluginOf(plugin)?.description ?? entry.about}
                </div>
            </div>
            {tag && <span className={cl("tag")}>{tag}</span>}
            <Button
                className={cl("cog")}
                size="iconOnly"
                variant="none"
                aria-label={`${label} settings`}
                title={`${label} settings`}
                onClick={() => openPluginModal(pluginOf(plugin))}
            >
                <GearIcon height={20} width={20} />
            </Button>
            <Switch
                checked={on || waiting}
                onChange={next => {
                    const result = setOn(plugin, next);

                    if (result === "failed") say(`Could not turn ${label} ${next ? "on" : "off"}`, "critical");
                    if (result === "restart") say(`${label} turns on after a reload`, "default");

                    onChange();
                }}
            />
        </div>
    );
}

/** Cloud Sync leaves out plugins whose "Keep after restart" is off, and says which */
const skippedNote = (skipped?: string[]) =>
    skipped?.length ? `. Skipped ${skipped.join(", ")}: "Keep after restart" is off` : "";

/** Sync without going to find its settings: the two buttons, for whoever already has a link */
function SyncRow() {
    const sync = pluginOf("CloudSync");
    const [busy, setBusy] = React.useState<"" | "up" | "down">("");
    const { link } = Settings.plugins.CloudSync ?? {};

    if (!sync?.started || !isEnabled("CloudSync")) return null;

    const run = async (which: "up" | "down") => {
        setBusy(which);

        try {
            if (which === "up") {
                const { sent, skipped } = await sync.sendUp();
                Settings.plugins.CloudSync.lastUp = { at: Date.now(), what: sent };
                say("Synced to cloud" + skippedNote(skipped), "success");
            } else {
                const { applied, skipped } = await sync.bringDown();
                Settings.plugins.CloudSync.lastDown = { at: Date.now(), what: applied };
                say("Synced from cloud" + skippedNote(skipped), "success");
            }
        } catch (e) {
            say(e instanceof Error ? e.message : String(e), "critical");
            logger.error("Sync failed", e);
        } finally {
            setBusy("");
        }
    };

    return (
        <div className={cl("item")}>
            <div className={cl("tile")}><SyncIcon height={20} width={20} /></div>
            <div className={cl("item-text")}>
                <div className={cl("item-name")}>Sync now</div>
                <div className={cl("item-detail")}>
                    {link
                        ? "Send or fetch without opening Cloud Sync."
                        : "Make a sync code in Cloud Sync first."}
                </div>
            </div>
            <div className={cl("actions")}>
                <IconButton icon={CloudUpIcon} variant="secondary" disabled={!link || !!busy} onClick={() => run("up")}>
                    {busy === "up" ? "Syncing..." : "To Cloud"}
                </IconButton>
                <IconButton icon={CloudDownIcon} variant="secondary" disabled={!link || !!busy} onClick={() => run("down")}>
                    {busy === "down" ? "Syncing..." : "From Cloud"}
                </IconButton>
            </div>
        </div>
    );
}

/** One switch of Screen Share Protection's, as a quieter row under it */
/** When the plugins' buttons show - one choice for all of them, for menus and for the hover bar */
const BUTTON_CHOICES: { value: "always" | "ctrl" | "never"; label: string; }[] = [
    { value: "always", label: "Always" },
    { value: "ctrl", label: "Holding Ctrl" },
    { value: "never", label: "Never" },
];

function ButtonChoice({ setting, icon: Icon, name, detail }: { setting: "menuButtons" | "hoverButtons"; icon: IconComponent; name: string; detail: string; }) {
    const values = settings.use([setting]);
    const current = values[setting] ?? "ctrl";

    return (
        <div className={cl("item")}>
            <div className={cl("tile")}><Icon height={20} width={20} /></div>
            <div className={cl("item-text")}>
                <div className={cl("item-name")}>{name}</div>
                <div className={cl("item-detail")}>{detail}</div>
            </div>
            <div className={cl("choice")} role="radiogroup" aria-label={name}>
                {BUTTON_CHOICES.map(choice => (
                    <button
                        key={choice.value}
                        type="button"
                        role="radio"
                        aria-checked={current === choice.value}
                        className={cl("choice-option", current === choice.value ? "choice-on" : "")}
                        onClick={() => void (settings.store[setting] = choice.value)}
                    >
                        {choice.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * The small fixes and extras, folded into one row like Screen Share Protection's choices.
 *
 * Each is switched on once and forgotten, so they do not each need a row in Tools - and a new
 * one joins them here rather than making the page longer.
 */
function Tweaks({ entries, onChange }: { entries: Entry[]; onChange(): void; }) {
    const [open, setOpen] = React.useState(false);
    const { undo } = settings.use(["undo"]);

    const on = entries.filter(entry => isEnabled(entry.plugin) && isOn(entry.plugin)).length + (undo !== false ? 1 : 0);
    const total = entries.length + 1;

    return (
        <>
            <div className={cl("item", open ? "item-open" : "")}>
                <div className={cl("tile")}><WrenchIcon height={20} width={20} /></div>
                <div className={cl("item-text")}>
                    <div className={cl("item-name")}>Tweaks</div>
                    <div className={cl("item-detail")}>Small fixes and extras, {on} of {total} on.</div>
                </div>
                <Button
                    className={cl("cog", open ? "cog-open" : "")}
                    size="iconOnly"
                    variant="none"
                    aria-expanded={open}
                    aria-label={open ? "Hide the tweaks" : "Show the tweaks"}
                    title={open ? "Hide the tweaks" : "Show the tweaks"}
                    onClick={() => setOpen(was => !was)}
                >
                    <ChevronDownIcon height={20} width={20} />
                </Button>
            </div>

            {open && (
                <div className={cl("sub")}>
                    {entries.map(entry => <PluginRow key={entry.plugin} entry={entry} onChange={onChange} sub />)}
                    <div className={cl("sub-row", undo !== false ? "" : "item-off")}>
                        <UndoIcon className={cl("sub-icon")} height={18} width={18} />
                        <div className={cl("item-text")}>
                            <div className={cl("sub-name")}>Undo</div>
                            <div className={cl("item-detail")}>Ctrl+Z undoes your last change.</div>
                        </div>
                        <Switch checked={undo !== false} onChange={next => void (settings.store.undo = next)} />
                    </div>
                </div>
            )}
        </>
    );
}

/** Everything saved on this computer, gone - asked about first */
function DeleteData() {
    return (
        <div className={cl("item")}>
            <div className={cl("tile")}><TrashIcon height={20} width={20} /></div>
            <div className={cl("item-text")}>
                <div className={cl("item-name")}>Delete all data</div>
                <div className={cl("item-detail")}>
                    Erases what these plugins saved, except your sync code.
                </div>
            </div>
            <IconButton
                icon={TrashIcon}
                variant="dangerSecondary"
                onClick={() => Alerts.show({
                    title: "Delete all data?",
                    body: "Everything these plugins saved is erased for good, and Discord reloads.",
                    confirmText: "Delete Everything",
                    cancelText: "Cancel",
                    onConfirm: () => void deleteAllData()
                })}
            >
                Delete
            </IconButton>
        </div>
    );
}

function ShareSwitch({ name, label, detail }: { name: "streamerMode" | "shareHideNew" | "shareHideMenus" | "shareHidePage" | "sharePlain" | "shareRestore"; label: string; detail: string; }) {
    const value = settings.use([name])[name];

    return (
        <div className={cl("sub-row")}>
            <div className={cl("item-text")}>
                <div className={cl("sub-name")}>{label}</div>
                <div className={cl("item-detail")}>{detail}</div>
            </div>
            <Switch checked={value !== false} onChange={next => void (settings.store[name] = next)} />
        </div>
    );
}

/** What Screen Share Protection does, each part of it a choice */
function ShareOptions() {
    const { shareSkip } = settings.use(["shareSkip"]);
    const skip: string[] = shareSkip ?? [];
    const views = installed().filter(isView);

    const toggle = (plugin: string) => {
        settings.store.shareSkip = skip.includes(plugin) ? skip.filter(name => name !== plugin) : [...skip, plugin];
    };

    return (
        <div className={cl("sub")}>
            <div className={cl("sub-row", "sub-row-stack")}>
                <div className={cl("item-text")}>
                    <div className={cl("sub-name")}>Turn on while sharing</div>
                    <div className={cl("item-detail")}>Switched on while you share, even if they are off.</div>
                </div>
                <div className={cl("menu-chips")} role="group" aria-label="Turn on while sharing">
                    {views.map(({ plugin, label, icon: Icon }) => {
                        const picked = !skip.includes(plugin);

                        return (
                            <button
                                key={plugin}
                                type="button"
                                className={cl("menu-chip", picked ? "menu-chip-on" : "")}
                                aria-pressed={picked}
                                onClick={() => toggle(plugin)}
                            >
                                <Icon height={16} width={16} />
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <ShareSwitch name="streamerMode" label="Also when Streamer Mode is on" detail="Counts Streamer Mode as sharing." />
            <ShareSwitch name="shareHideNew" label="Hide anything new" detail="Hides anything that arrives while you share." />
            <ShareSwitch name="shareHideMenus" label="Hide plugin buttons" detail="Ctrl still shows them." />
            <ShareSwitch name="shareHidePage" label="Hide this page" detail="Takes this page out of the sidebar." />
            <ShareSwitch name="sharePlain" label="Look like plain Discord" detail="Hides Vencord and every other plugin." />
            <ShareSwitch name="shareRestore" label="Switch back after" detail="Plugins switched on for the share go off again." />
        </div>
    );
}

function HubPage() {
    const [, redraw] = React.useState(0);
    // Screen Share Protection's own choices, folded away until asked for: they are set once,
    // and the page should open on what you came for
    const [shareOpen, setShareOpen] = React.useState(false);
    const update = () => redraw(n => n + 1);

    const { shareProtection } = settings.use(["shareProtection"]);
    const protecting = isProtecting();

    // A share starting or ending switches plugins behind this page's back.
    React.useEffect(() => onProtectionChange(update), []);

    const all = installed();
    const views = usable().filter(isView);
    const live = applying().length;
    const waiting = views.some(entry => isWaiting(entry.plugin));

    return (
        <SettingsTab>
            <div className={cl("page")}>
                {/* where things stand, the one switch for all of it, and the protection you reach for before a call */}
                <section className={cl("section")}>
                    <h2 className={cl("heading")}>Overview</h2>
                    <div className={cl("item")}>
                        <div className={cl("tile")}><EyeIcon height={20} width={20} /></div>
                        <div className={cl("item-text")}>
                            <div className={cl("item-name")}>
                                {!views.length
                                    ? "No plugins on"
                                    : live ? `${live} of ${views.length} plugins on` : "All plugins off"}
                            </div>
                            <div className={cl("item-detail")}>
                                {!views.length
                                    ? "Switch one on below."
                                    : live
                                        ? "Showing your changes."
                                        : "Showing the real Discord. Nothing is lost."}
                            </div>
                        </div>
                        <IconButton
                            icon={live ? EyeOffIcon : EyeIcon}
                            size="medium"
                            variant={live ? "primary" : "secondary"}
                            disabled={!views.length}
                            onClick={() => {
                                const result = flipAll(settings.store.paused ?? []);

                                // Not the ones a share switched on. You had those off, and Turn
                                // On should not be what turns them on for good.
                                const lent = raisedForShare();
                                settings.store.paused = result.remember.filter(name => !lent.includes(name));
                                update();

                                say(result.on
                                        ? `Plugins on${result.restart ? ", some after a reload" : ""}`
                                        : "Plugins off", "success");
                            }}
                        >
                            {live ? "Turn Off" : "Turn On"}
                        </IconButton>
                    </div>

                    {waiting && (
                        <div className={cl("item")}>
                            <div className={cl("tile")}><RefreshIcon height={20} width={20} /></div>
                            <div className={cl("item-text")}>
                                <div className={cl("item-name")}>Reload needed</div>
                                <div className={cl("item-detail")}>A plugin you switched on starts after a reload.</div>
                            </div>
                            <IconButton icon={RefreshIcon} variant="secondary" onClick={() => location.reload()}>Reload Now</IconButton>
                        </div>
                    )}

                    <div className={cl("item", shareProtection !== false && shareOpen ? "item-open" : "")}>
                        <div className={cl("tile")}><ScreenShareIcon height={20} width={20} /></div>
                        <div className={cl("item-text")}>
                            <div className={cl("item-name")}>Screen Share Protection</div>
                            <div className={cl("item-detail")}>
                                {protecting
                                    ? "On now, while you share."
                                    : "Hides everything while you share."}
                            </div>
                        </div>
                        {shareProtection !== false && (
                            <Button
                                className={cl("cog", shareOpen ? "cog-open" : "")}
                                size="iconOnly"
                                variant="none"
                                aria-expanded={shareOpen}
                                aria-label={shareOpen ? "Hide the options" : "Show the options"}
                                title={shareOpen ? "Hide the options" : "Show the options"}
                                onClick={() => setShareOpen(open => !open)}
                            >
                                <ChevronDownIcon height={20} width={20} />
                            </Button>
                        )}
                        <Switch checked={shareProtection !== false} onChange={next => void (settings.store.shareProtection = next)} />
                    </div>

                    {shareProtection !== false && shareOpen && <ShareOptions />}
                </section>

                {SECTIONS.map(({ id, title }) => {
                    const rows = all.filter(entry => entry.section === id && !entry.tweak);
                    const tweaks = all.filter(entry => entry.section === id && entry.tweak);
                    if (!rows.length && !tweaks.length) return null;

                    return (
                        <section className={cl("section")} key={id}>
                            <h2 className={cl("heading")}>{title}</h2>
                            {rows.map(entry => (
                                <React.Fragment key={entry.plugin}>
                                    {/* the tweaks, folded, before the sync pair at the end */}
                                    {entry.plugin === "CloudSync" && !!tweaks.length && <Tweaks entries={tweaks} onChange={update} />}
                                    <PluginRow entry={entry} onChange={update} />
                                    {/* straight under the plugin it belongs to */}
                                    {entry.plugin === "CloudSync" && <SyncRow />}
                                </React.Fragment>
                            ))}
                        </section>
                    );
                })}

                {/* set once and left alone, so below everything you come back for */}
                <section className={cl("section")}>
                    <h2 className={cl("heading")}>Buttons</h2>
                    <ButtonChoice setting="menuButtons" icon={MenuIcon} name="Menu buttons" detail="When plugin options show in right-click menus." />
                    <ButtonChoice setting="hoverButtons" icon={CursorIcon} name="Hover buttons" detail="When plugin buttons show above messages." />
                </section>

                <section className={cl("section")}>
                    <h2 className={cl("heading")}>Your data</h2>
                    <DeleteData />
                </section>
            </div>
        </SettingsTab>
    );
}

export default wrapTab(HubPage, "Additional Settings");
