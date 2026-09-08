/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IconProps } from "@utils/types";
import { useLayoutEffect, useRef } from "@webpack/common";
import type { ReactNode, Ref } from "react";

// Namespaced per plugin so two copies of this file can't fight over the same classes.
const NS = "vc-cim";
export const GATED_CLASS = `${NS}-shift-only`;
const BODY_CLASS = `${NS}-shift-down`;

export type GatedIcon = (props: IconProps & { innerRef?: Ref<SVGSVGElement>; } & Record<string, any>) => ReactNode;

let held = false;

/** Live Shift state, for menus that are built at click time rather than rendered */
export const isShiftHeld = () => held;

/**
 * Shift as it was when the menu opened.
 *
 * Context menus re-render while they're open, so reading the live state made entries pop
 * in and out a beat behind the key as Discord got round to redrawing. Freezing it at open
 * time means the menu you get is the menu you asked for, and it stays put.
 */
let heldAtOpen = false;
export const isShiftHeldForMenu = () => heldAtOpen;

// capture phase, so it runs before Discord builds the menu
const onContextMenu = () => (heldAtOpen = held);

function setHeld(next: boolean) {
    if (next === held) return;

    held = next;
    document.body.classList.toggle(BODY_CLASS, next);
}

// key repeat fires these continuously while held, but setHeld bails on no-op changes
const onKeyDown = (e: KeyboardEvent) => e.key === "Shift" && setHeld(true);
const onKeyUp = (e: KeyboardEvent) => e.key === "Shift" && setHeld(false);
// releasing Shift while another window has focus never reaches us, so reset on blur
const onBlur = () => setHeld(false);

export function startShiftTracking() {
    window.addEventListener("contextmenu", onContextMenu, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
}

export function stopShiftTracking() {
    window.removeEventListener("contextmenu", onContextMenu, true);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    setHeld(false);
}

/**
 * Wrap a toolbar icon so its entire button only exists visually while Shift is held.
 *
 * The button is tagged once on mount and everything after that is a single class on
 * <body>, so pressing Shift costs one class toggle and a style recalc scoped to those
 * buttons: no React renders, no DOM queries, no per-frame work. Tagging happens in a
 * layout effect, so the button is already hidden before the first paint.
 */
export function shiftGated(Icon: GatedIcon): GatedIcon {
    return function ShiftGatedIcon(props) {
        const ref = useRef<SVGSVGElement>(null);

        useLayoutEffect(() => {
            const button = ref.current?.closest<HTMLElement>("button, [role='button'], [class*='button']");
            if (!button) return;

            button.classList.add(GATED_CLASS);
            return () => button.classList.remove(GATED_CLASS);
        }, []);

        return <Icon {...props} innerRef={ref} />;
    };
}
