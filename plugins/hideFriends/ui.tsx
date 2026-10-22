/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Button, ButtonProps } from "@components/Button";
import { Tooltip } from "@webpack/common";
import type { ReactNode } from "react";

import { IconComponent, LockIcon } from "./icons";

export const cl = classNameFactory("vc-chf-");

/** A button with an icon in front of its label */
export function IconButton({ icon: Icon, children, ...props }: ButtonProps & { icon: IconComponent; }) {
    return (
        <Button size="small" {...props}>
            <Icon className={cl("btn-icon")} height={16} width={16} />
            {children}
        </Button>
    );
}

/** An icon-only button with its name on hover. Clicks on it do not reach the row it sits on. */
export function RoundButton({ icon: Icon, label, danger, onClick }: { icon: IconComponent; label: string; danger?: boolean; onClick(): void; }) {
    return (
        <Tooltip text={label}>
            {(props: any) => (
                <button
                    {...props}
                    type="button"
                    aria-label={label}
                    className={cl("round", danger ? "round-danger" : "")}
                    onClick={event => {
                        event.stopPropagation();
                        onClick();
                    }}
                >
                    <Icon height={18} width={18} />
                </button>
            )}
        </Tooltip>
    );
}

/** The card at the top of a plugin's settings: what it does and how to reach it */
export function About({ icon: Icon, title, steps, menus, note = "Only you see this. Nothing is sent to Discord and nobody is notified." }: {
    icon: IconComponent;
    title: string;
    steps: ReactNode[];
    /** whether the steps mention menu buttons, which may only show while Ctrl is held */
    menus?: boolean;
    /** the reassurance under the steps, or false where there is nothing to reassure about */
    note?: string | false;
}) {
    // chosen on Additional Settings, and left on the window for every plugin to read
    const ctrlOnly = menus && ["ctrl", "shift"].includes((window as any).vcMenuMode);

    return (
        <div className={cl("about")}>
            <div className={cl("about-head")}>
                <div className={cl("tile")}>
                    <Icon height={20} width={20} />
                </div>
                <div className={cl("about-title")}>{title}</div>
            </div>
            <ul className={cl("steps")}>
                {steps.map((step, i) => <li key={i}>{step}</li>)}
            </ul>
            {ctrlOnly && (
                <div className={cl("private")}>
                    <span>Menu buttons show while you hold <kbd>Ctrl</kbd>. Change this on Additional Settings.</span>
                </div>
            )}
            {note && (
                <div className={cl("private")}>
                    <LockIcon height={14} width={14} />
                    <span>{note}</span>
                </div>
            )}
        </div>
    );
}

/** A titled block with its actions on the right */
export function Panel({ title, count, actions, children }: { title?: string; count?: number; actions?: ReactNode; children?: ReactNode; }) {
    return (
        <div className={cl("panel")}>
            {(title || actions) && (
                <div className={cl("panel-head")}>
                    <div className={cl("panel-title")}>
                        {title}
                        {count != null && <span className={cl("pill")}>{count}</span>}
                    </div>
                    {actions && <div className={cl("actions")}>{actions}</div>}
                </div>
            )}
            {children}
        </div>
    );
}

/** One entry in a list: a picture, a name, a quieter line under it, and what can be done */
export function Row({ image, icon: Icon, round = true, name, detail, children, onClick, title }: {
    image?: string | null;
    icon?: IconComponent;
    round?: boolean;
    name: ReactNode;
    detail?: ReactNode;
    children?: ReactNode;
    /** the row itself opens something - the person, the chat */
    onClick?(): void;
    title?: string;
}) {
    return (
        <div
            className={cl("row", onClick ? "row-click" : "")}
            title={title}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick && (event => event.key === "Enter" && onClick())}
        >
            {image
                ? <img className={cl("avatar", round ? "avatar-round" : "avatar-square")} src={image} alt="" />
                : (
                    <div className={cl("avatar", "avatar-blank", round ? "avatar-round" : "avatar-square")}>
                        {Icon ? <Icon height={16} width={16} /> : String(name).slice(0, 1).toUpperCase()}
                    </div>
                )}
            <div className={cl("row-text")}>
                <div className={cl("row-name")}>{name}</div>
                {detail && <div className={cl("row-detail")}>{detail}</div>}
            </div>
            {children && <div className={cl("actions")}>{children}</div>}
        </div>
    );
}

/** What a list says when there is nothing in it */
export function Empty({ icon: Icon, title, text }: { icon: IconComponent; title: string; text: string; }) {
    return (
        <div className={cl("empty")}>
            <Icon height={22} width={22} />
            <div className={cl("empty-title")}>{title}</div>
            <div className={cl("empty-text")}>{text}</div>
        </div>
    );
}

/** A small tick, drawn here so this file needs nothing from the plugin's own icons */
function Tick() {
    return (
        <svg aria-hidden viewBox="0 0 24 24" height={14} width={14}>
            <path fill="currentColor" d="M9 16.17L4.17 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
    );
}

/**
 * Where a plugin's right-click entries appear, as one row of toggles.
 *
 * Instead of a switch per menu, each with a sentence saying the same thing about a different
 * place. The switches it stands for are still the settings underneath, only not drawn.
 */
export function menuChips(store: () => any, title: string, detail: string, items: { key: string; label: string; }[]) {
    return function MenuChips() {
        const settings = store();
        const values = settings.use(items.map(item => item.key));

        return (
            <div className={cl("menus")}>
                <div className={cl("menus-title")}>{title}</div>
                <div className={cl("menus-detail")}>{detail}</div>
                <div className={cl("menu-chips")} role="group" aria-label={title}>
                    {items.map(({ key, label }) => {
                        const on = values[key] !== false;

                        return (
                            <button
                                key={key}
                                type="button"
                                className={cl("menu-chip", on ? "menu-chip-on" : "")}
                                aria-pressed={on}
                                onClick={() => void (settings.store[key] = !on)}
                            >
                                {on && <Tick />}
                                <span>{label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };
}

const HOVER_CHOICES = [["always", "Always"], ["ctrl", "Holding Ctrl"], ["never", "Never"]] as const;

/**
 * When a plugin's hover button shows, as its own choice.
 *
 * Only drawn without Additional Settings: with it, Hover buttons there decides for every
 * plugin at once, and a second answer here would only contradict it.
 */
export function hoverChoice(store: () => any, detail: string) {
    return function HoverChoice() {
        const settings = store();
        const { button } = settings.use(["button"]);
        if ((window as any).vcHoverMode !== undefined) return null;

        const current = button ?? "ctrl";
        return (
            <div className={cl("menus")}>
                <div className={cl("menus-title")}>Hover button</div>
                <div className={cl("menus-detail")}>{detail}</div>
                <div className={cl("menu-chips")} role="radiogroup" aria-label="Hover button">
                    {HOVER_CHOICES.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={current === value}
                            className={cl("menu-chip", current === value ? "menu-chip-on" : "")}
                            onClick={() => void (settings.store.button = value)}
                        >
                            {current === value && <Tick />}
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    };
}
