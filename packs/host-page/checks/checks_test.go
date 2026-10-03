package checks

import (
	"strings"
	"testing"
)

func TestPageObserversDisconnected(t *testing.T) {
	watch := "export function watch(root, onChange) {\n  const observer = new MutationObserver(onChange);\n  observer.observe(root, { childList: true, subtree: true });\n"
	fs := run(t, pageObserversDisconnected, map[string]string{"src/watcher.js": watch + "}\n"}, nil)
	expect(t, "never disconnected", fs, "src/watcher.js:2")
	if !strings.Contains(said(fs), "never disconnects one") {
		t.Errorf("said %q", said(fs))
	}
	for name, files := range map[string]map[string]string{
		"disconnected somewhere":   {"src/watcher.js": watch + "  return () => observer.disconnect();\n}\n"},
		"constructed, not started": {"src/w.js": "const o = new ResizeObserver(f);\n"},
		"a comment only":           {"src/w.js": "// new MutationObserver(f).observe(x)\n"},
		"a test file":              {"src/watcher.test.js": watch + "}\n", "test/w.js": watch + "}\n"},
	} {
		expect(t, name, run(t, pageObserversDisconnected, files, nil), "")
	}
}

func TestSyntheticInputEventsBubble(t *testing.T) {
	cases := []struct{ name, src, want, says string }{
		{"no init", "export const click = (cell) => cell.dispatchEvent(new MouseEvent('click'));\n", "src/a.js:1", "constructed with no init, so it does not bubble"},
		{"init without bubbles", "el.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'a' }));\n", "src/a.js:1", "does not set bubbles: true"},
		{"through a local", "const ev = new PointerEvent('pointerdown');\nel.dispatchEvent(ev);\n", "src/a.js:1", "PointerEvent"},
		{"through an alias", "const Ctor = key ? view.KeyboardEvent : view.MouseEvent;\nconst e = new Ctor(type, { bubbles: false });\nnode.dispatchEvent(e);\n", "src/a.js:2", "Ctor"},
		{"bubbles set", "cell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));\n", "", ""},
		{"a CustomEvent", "el.dispatchEvent(new CustomEvent('cc:ready'));\n", "", ""},
		{"a spread init", "el.dispatchEvent(new MouseEvent('click', { ...init }));\n", "", ""},
		{"a spread init that sets bubbles false", "el.dispatchEvent(new MouseEvent('click', { ...init, bubbles: false }));\n", "src/a.js:1", ""},
		{"constructed, never dispatched", "const ev = new MouseEvent('click');\nel.dispatchEvent(other);\n", "", ""},
		{"a property target", "this.ev = new MouseEvent('click');\nel.dispatchEvent(ev);\n", "", ""},
		{"unbalanced", "el.dispatchEvent(new MouseEvent('click'\n", "", ""},
	}
	for _, c := range cases {
		fs := run(t, syntheticInputEventsBubble, map[string]string{"src/a.js": c.src}, nil)
		expect(t, c.name, fs, c.want)
		if !strings.Contains(said(fs), c.says) {
			t.Errorf("%s: said %q", c.name, said(fs))
		}
	}
}

func TestSyntheticInputEventsTargetAppNode(t *testing.T) {
	cases := []struct{ name, src, want, says string }{
		{"document", "export const type = (key) =>\n  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));\n", "src/a.js:2", "dispatches a KeyboardEvent at document,"},
		{"window.document.body", "window.document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));\n", "src/a.js:1", "at window.document.body"},
		{"an alias of body", "const root = document.body;\nconst ev = new InputEvent('input', { bubbles: true });\nroot.dispatchEvent(ev);\n", "src/a.js:3", "InputEvent at document.body"},
		{"a node in the app", "cell.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));\n", "", ""},
		{"a CustomEvent at document", "document.dispatchEvent(new CustomEvent('x'));\n", "", ""},
	}
	for _, c := range cases {
		fs := run(t, syntheticInputEventsTargetAppNode, map[string]string{"src/a.js": c.src}, nil)
		expect(t, c.name, fs, c.want)
		if !strings.Contains(said(fs), c.says) {
			t.Errorf("%s: said %q", c.name, said(fs))
		}
	}
}

func TestBackUTF16(t *testing.T) {
	s := "aé😀b"
	for _, c := range []struct{ n, want int }{{1, 7}, {3, 3}, {2, 7}, {4, 1}, {9, 0}} {
		if got := backUTF16(s, len(s), c.n); got != c.want {
			t.Errorf("back %d: %d, want %d", c.n, got, c.want)
		}
	}
}
