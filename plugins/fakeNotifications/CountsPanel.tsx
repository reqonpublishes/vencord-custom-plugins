/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";

import { realCount, setShown, shiftFor, Which } from ".";
import { IconComponent, MailIcon, PersonAddIcon, UndoIcon } from "./icons";
import { cl, IconButton, Panel } from "./ui";

const ROWS: { which: Which; label: string; where: string; icon: IconComponent; }[] = [
    { which: "friends", label: "Friend requests", where: "The Friends button and its Pending tab", icon: PersonAddIcon },
    { which: "requests", label: "Message requests", where: "Message Requests in your DM list", icon: MailIcon }
];

function Row({ which, label, where, icon: Icon, onChange }: typeof ROWS[number] & { onChange(): void; }) {
    const real = realCount(which);
    const shift = shiftFor(which);

    // The box holds the number you want to see. What is really there sits behind it in grey,
    // so an empty box reads as the truth rather than as nothing.
    const [typed, setTyped] = useState(shift === null ? "" : String(Math.max(0, real + shift)));

    const apply = (text: string) => {
        const clean = text.trim().replace(/[^0-9]/g, "");
        setTyped(clean);

        const value = Number(clean);
        setShown(which, clean && Number.isFinite(value) ? Math.min(value, 9_999_999) : null);

        // so Reset knows whether there is anything to reset
        onChange();
    };

    return (
        <div className={cl("row")}>
            <div className={cl("tile")}>
                <Icon height={18} width={18} />
            </div>
            <div className={cl("row-text")}>
                <div className={cl("row-name")}>{label}</div>
                <div className={cl("row-detail")}>{where} &middot; really {real}</div>
            </div>
            <input
                type="text"
                inputMode="numeric"
                aria-label={label}
                className={cl("number")}
                value={typed}
                placeholder={String(real)}
                onChange={e => apply(e.currentTarget.value)}
            />
        </div>
    );
}

export function CountsPanel() {
    // Bumped by Reset only: it is part of each row's key, so the boxes are rebuilt empty.
    // Typing must not touch it, or the box being typed in would be replaced mid-word.
    const [round, setRound] = useState(0);
    const [, setTick] = useState(0);
    const changed = shiftFor("friends") !== null || shiftFor("requests") !== null;

    return (
        <Panel
            title="Badge numbers"
            actions={
                <IconButton
                    icon={UndoIcon}
                    variant="dangerSecondary"
                    disabled={!changed}
                    onClick={() => {
                        setShown("friends", null);
                        setShown("requests", null);
                        setRound(round + 1);
                    }}
                >
                    Reset
                </IconButton>
            }
        >
            <div className={cl("rows")}>
                {ROWS.map(row => <Row key={row.which + round} {...row} onChange={() => setTick(t => t + 1)} />)}
            </div>
        </Panel>
    );
}
