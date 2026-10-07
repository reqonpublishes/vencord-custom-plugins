/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { Button } from "@components/Button";
import { useState } from "@webpack/common";

import { realCount, setShown, shiftFor, Which } from ".";

const cl = classNameFactory("vc-cfn-");

const ROWS: { which: Which; label: string; where: string; }[] = [
    { which: "friends", label: "Friend requests", where: "The Friends button and its Pending tab" },
    { which: "requests", label: "Message requests", where: "The Message Requests entry in your DM list" }
];

function Row({ which, label, where }: { which: Which; label: string; where: string; }) {
    const real = realCount(which);
    const shift = shiftFor(which);

    // The box holds the number you want to see. What is really there sits behind it in grey,
    // so an empty box reads as the truth rather than as nothing.
    const [typed, setTyped] = useState(shift === null ? "" : String(Math.max(0, real + shift)));

    const apply = (text: string) => {
        setTyped(text);

        const clean = text.trim().replace(/[^0-9]/g, "");
        if (!clean) return setShown(which, null);

        const value = Number(clean);
        if (Number.isFinite(value)) setShown(which, Math.min(value, 9_999_999));
    };

    return (
        <div className={cl("row")}>
            <div className={cl("text")}>
                <div className={cl("label")}>{label}</div>
                <div className={cl("where")}>{where}</div>
            </div>
            <input
                type="text"
                inputMode="numeric"
                className={cl("input")}
                value={typed}
                placeholder={String(real)}
                onChange={e => apply(e.currentTarget.value)}
            />
        </div>
    );
}

export function CountsPanel() {
    const [round, setRound] = useState(0);

    return (
        <div className={cl("panel")}>
            {ROWS.map(row => <Row key={row.which + round} {...row} />)}

            <Button
                size="small"
                variant="dangerSecondary"
                onClick={() => {
                    setShown("friends", null);
                    setShown("requests", null);
                    setRound(round + 1);
                }}
            >
                Put the real numbers back
            </Button>
        </div>
    );
}
