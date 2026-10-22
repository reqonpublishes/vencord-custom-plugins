# Regenerate every plugin's shared ui.tsx / shared.css / icons.tsx from the templates, keeping its prefix, kinds and icons
import glob
import os
import re
import subprocess
import sys

P = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "plugins")
GEN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gen.py")
extra = dict(arg.split("=") for arg in sys.argv[1:])  # folder=Icon1,Icon2 to add icons

for ui in sorted(glob.glob(os.path.join(P, "*", "ui.tsx"))):
    folder = os.path.basename(os.path.dirname(ui))
    prefix = re.search(r'classNameFactory\("([^"]+)-"\)', open(ui, encoding="utf-8").read()).group(1)
    css = open(os.path.join(P, folder, "shared.css"), encoding="utf-8").read()
    kinds = "ui,form" if f".{prefix}-input {{" in css else "ui"
    icons = re.findall(r"export const (\w+)Icon = icon", open(os.path.join(P, folder, "icons.tsx"), encoding="utf-8").read())
    icons = sorted((set(icons) - {"Lock"}) | set(filter(None, extra.get(folder, "").split(","))))
    r = subprocess.run(["python", "-I", GEN, P, folder, prefix, kinds, *icons], capture_output=True, text=True)
    print(folder, prefix, kinds, "ok" if r.returncode == 0 else r.stderr[-300:])
