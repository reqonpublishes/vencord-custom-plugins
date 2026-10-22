/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Ctrl+Z for the hide and fake plugins.
 *
 * One list of what was just done, shared by every plugin through the window - the same file is
 * in each of them - so Ctrl+Z takes back the last thing done, whichever plugin did it. Only
 * things you did by hand go on it: a menu entry, a window's button, a button in settings.
 *
 * Ctrl+Z still belongs to whatever you are typing in. It only reaches this list from outside a
 * text box, or from the message box while it is empty - where there is nothing of yours to undo.
 */

import { say } from "./say";

interface Step {
    label: string;
    undo(): void;
}

interface Undo {
    steps: Step[];
    listening: boolean;
}

const U: Undo = (window as any).__vcUndo ??= { steps: [], listening: false };

/** How far back Ctrl+Z reaches */
const MOST = 30;

/** Put something just done on the list, with how to take it back */
export function remember(label: string, undo: () => void) {
    U.steps.push({ label, undo });
    if (U.steps.length > MOST) U.steps.shift();
    listen();
}

/** Run something and remember it in one go, when the way back is known before it happens */
export function done<T>(label: string, run: () => T, undo: () => void): T {
    const result = run();
    remember(label, undo);
    return result;
}

function ownedByTyping(el: Element | null): boolean {
    if (!el) return false;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
    // the message box: yours while it has anything in it
    if ((el as HTMLElement).isContentEditable) return !!el.textContent?.trim();
    return false;
}

function onKey(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== "z") return;
    // Additional Settings can switch it off
    if ((window as any).vcUndoOff || ownedByTyping(document.activeElement)) return;

    const step = U.steps.pop();
    if (!step) return;

    event.preventDefault();
    event.stopPropagation();

    try {
        step.undo();
        say(`Undone: ${step.label}`);
    } catch {
        say(`Could not undo ${step.label}`, "critical");
    }
}

function listen() {
    if (U.listening) return;
    U.listening = true;
    window.addEventListener("keydown", onKey, true);
}
