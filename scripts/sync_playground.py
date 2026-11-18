# /// script
# requires-python = ">=3.10"
# ///
"""Copy the CSS block from src/feedback.tsx into playground/index.html so the preview is the real stylesheet."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
tsx = (root / "src/feedback.tsx").read_text()
css = re.search(r"const FB_CSS = `\n(.*?)`;", tsx, re.S).group(1)
p = root / "playground/index.html"
html, n = re.subn(r"(/\* @css:start[^\n]*\*/\n).*?(/\* @css:end \*/)", lambda m: m.group(1) + css + m.group(2), p.read_text(), flags=re.S)
assert n == 1, "markers not found"
p.write_text(html)
print("playground CSS synced")
