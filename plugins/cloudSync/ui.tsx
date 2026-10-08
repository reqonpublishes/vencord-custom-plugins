/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Button, ButtonProps } from "@components/Button";
import type { ReactNode } from "react";

import { IconComponent, LockIcon } from "./icons";

export const cl = classNameFactory("vc-sync-");

/** A button with an icon in front of its label */
export function IconButton({ icon: Icon, children, ...props }: ButtonProps & { icon: IconComponent; }) {
    return (
        <Button size="small" {...props}>
            <Icon className={cl("btn-icon")} height={16} width={16} />
            {children}
        </Button>
    );
}

/** The card at the top of a plugin's settings: what it does and how to reach it */
export function About({ icon: Icon, title, steps, note = "Only you see this. Nothing is sent to Discord and nobody is notified." }: {
    icon: IconComponent;
    title: string;
    steps: ReactNode[];
    /** the reassurance under the steps, or false where there is nothing to reassure about */
    note?: string | false;
}) {
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
export function Row({ image, icon: Icon, round = true, name, detail, children }: {
    image?: string | null;
    icon?: IconComponent;
    round?: boolean;
    name: string;
    detail?: string;
    children?: ReactNode;
}) {
    return (
        <div className={cl("row")}>
            {image
                ? <img className={cl("avatar", round ? "avatar-round" : "avatar-square")} src={image} alt="" />
                : (
                    <div className={cl("avatar", "avatar-blank", round ? "avatar-round" : "avatar-square")}>
                        {Icon ? <Icon height={16} width={16} /> : name.slice(0, 1).toUpperCase()}
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
