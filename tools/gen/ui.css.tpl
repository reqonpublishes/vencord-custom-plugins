/* ---------------------------------------------------------------- settings */

/*
 * Neutral translucent greys rather than theme variables throughout: several themes set the
 * input and card backgrounds to pure black, which makes them vanish against a modal. Mid
 * grey at low alpha lifts on dark themes and sits back on light ones.
 */
.__PREFIX__-btn-icon {
    flex: 0 0 auto;
    margin-right: 6px;
}

.__PREFIX__-about {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border: 1px solid var(--border-subtle, rgb(128 128 128 / 20%));
    border-radius: var(--radius-md, 12px);
}

.__PREFIX__-about-head {
    display: flex;
    gap: 10px;
    align-items: center;
}

.__PREFIX__-tile {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-sm, 8px);
    background: var(--background-mod-subtle, rgb(128 128 128 / 12%));
    color: var(--icon-default, var(--text-default));
}

.__PREFIX__-about-title {
    color: var(--text-default, var(--text-normal));
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
}

.__PREFIX__-steps {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0 0 0 18px;
    color: var(--text-default, var(--text-normal));
    font-size: 14px;
    line-height: 20px;
    list-style: disc;
}

.__PREFIX__-steps strong {
    font-weight: 600;
}

.__PREFIX__-steps kbd {
    padding: 1px 5px;
    border: 1px solid rgb(128 128 128 / 28%);
    border-radius: 4px;
    background: rgb(128 128 128 / 16%);
    font-size: 12px;
    font-family: var(--font-primary);
}

.__PREFIX__-private {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 16px;
}

.__PREFIX__-private svg {
    flex: 0 0 auto;
}

.__PREFIX__-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 4px;
}

.__PREFIX__-panel-head {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
}

.__PREFIX__-panel-title {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--text-default, var(--text-normal));
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
}

.__PREFIX__-pill {
    padding: 0 7px;
    border-radius: 99px;
    background: var(--background-mod-normal, rgb(128 128 128 / 22%));
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 18px;
}

.__PREFIX__-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.__PREFIX__-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.__PREFIX__-row {
    display: flex;
    flex: 0 0 auto;
    gap: 12px;
    align-items: center;
    padding: 8px 10px;
    border-radius: var(--radius-sm, 8px);
    background: var(--background-mod-subtle, rgb(128 128 128 / 8%));
}

/* a row that opens something: lit under the pointer */
.__PREFIX__-row-click {
    cursor: pointer;
    transition: background-color .12s ease;
}

.__PREFIX__-row-click:hover,
.__PREFIX__-row-click:focus-visible {
    background: var(--background-mod-normal, rgb(128 128 128 / 14%));
    outline: none;
}

/* an icon-only button, as on Discord's own friends rows */
.__PREFIX__-round {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--background-mod-subtle, rgb(128 128 128 / 14%));
    color: var(--icon-subtle, var(--text-muted));
    cursor: pointer;
    transition: color .12s ease, background-color .12s ease;
}

.__PREFIX__-round:hover,
.__PREFIX__-round:focus-visible {
    background: var(--background-mod-strong, rgb(128 128 128 / 24%));
    color: var(--icon-strong, var(--text-default));
    outline: none;
}

.__PREFIX__-round-danger:hover,
.__PREFIX__-round-danger:focus-visible {
    color: var(--text-feedback-critical, var(--status-danger, #f23f43));
}

.__PREFIX__-avatar {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    object-fit: cover;
}

.__PREFIX__-avatar-round {
    border-radius: 50%;
}

.__PREFIX__-avatar-square {
    border-radius: 10px;
}

.__PREFIX__-avatar-blank {
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(128 128 128 / 24%);
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 600;
}

.__PREFIX__-row-text {
    flex: 1 1 auto;
    min-width: 0;
}

.__PREFIX__-row-name,
.__PREFIX__-row-detail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.__PREFIX__-row-name {
    color: var(--text-default, var(--text-normal));
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
}

.__PREFIX__-row-detail {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 16px;
}

.__PREFIX__-empty {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: center;
    padding: 18px 12px;
    border: 1px dashed var(--border-subtle, rgb(128 128 128 / 24%));
    border-radius: var(--radius-sm, 8px);
    color: var(--text-muted);
    text-align: center;
}

.__PREFIX__-empty-title {
    margin-top: 4px;
    color: var(--text-default, var(--text-normal));
    font-size: 14px;
    font-weight: 500;
    line-height: 18px;
}

.__PREFIX__-empty-text {
    font-size: 13px;
    line-height: 18px;
}

.__PREFIX__-group-title {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .02em;
    line-height: 16px;
    text-transform: uppercase;
}

/* ---------------------------------------------------------------- where the menu entries show */

.__PREFIX__-menus {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.__PREFIX__-menus-title {
    color: var(--header-primary, var(--text-default));
    font-size: 16px;
    font-weight: 500;
    line-height: 20px;
}

.__PREFIX__-menus-detail {
    color: var(--text-muted);
    font-size: 14px;
    line-height: 18px;
}

.__PREFIX__-menu-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}

.__PREFIX__-menu-chip {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--background-mod-subtle, rgb(128 128 128 / 10%));
    color: var(--text-muted);
    font-size: 14px;
    line-height: 18px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color .15s ease, color .15s ease;
}

.__PREFIX__-menu-chip:hover {
    background: var(--background-mod-normal, rgb(128 128 128 / 16%));
    color: var(--text-default);
}

.__PREFIX__-menu-chip:focus-visible {
    outline: 2px solid var(--focus-primary, #00b0f4);
    outline-offset: 2px;
}

.__PREFIX__-menu-chip-on {
    background: var(--background-mod-strong, rgb(128 128 128 / 24%));
    color: var(--text-strong, var(--header-primary));
}

.__PREFIX__-menu-chip-on:hover {
    background: var(--background-mod-strong, rgb(128 128 128 / 24%));
}
