package checks

import (
	"bytes"
	"encoding/json"
	"math"
	"strconv"
	"strings"
	"unicode/utf16"
)

// The page's reader of a pack's dashboard.json (parseDescriptor in
// src/read/contributions.mjs), verdict for verdict: the closed vocabulary
// of kinds and sources, a kind the reader predates kept as an unknown
// widget, the repo card's six-widget clip, the label and noun caps, and
// one named fault for a file the page cannot use. The page runs in a
// browser and this runs in cn, so the two are held together by
// testdata/descriptor-verdicts.json, which both suites read.

var (
	descriptorKinds   = []string{"stat", "event", "window", "list"}
	descriptorSources = []string{"generated", "latest-release", "repo-stars"}
)

// The renderer-owned budgets.
const (
	maxRepoWidgets = 6
	maxLabel       = 34
	maxNoun        = 16
)

// widget is one normalised widget. Kind is nil when the descriptor's kind
// is not a string; Glyph is nil unless it is one code point.
type widget struct {
	ID     string  `json:"id"`
	Kind   *string `json:"kind"`
	Known  bool    `json:"known"`
	Label  string  `json:"label"`
	Noun   string  `json:"noun"`
	Glyph  *string `json:"glyph"`
	Source string  `json:"source"`
}

// descriptor is a parsed descriptor: Fault is the one reason the page
// cannot use it, and then nothing else is set.
type descriptor struct {
	Pack    string   `json:"pack"`
	Widgets []widget `json:"widgets"`
	Repo    []string `json:"repo"`
	Fault   *string  `json:"fault"`
}

func (d descriptor) declares(id any) bool {
	s, ok := id.(string)
	if !ok {
		return false
	}
	for _, w := range d.Widgets {
		if w.ID == s {
			return true
		}
	}
	return false
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// isJSWhitespace is a character String#trim removes.
func isJSWhitespace(r rune) bool {
	switch r {
	case '\t', '\n', '\v', '\f', '\r', ' ', 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff:
		return true
	}
	return r >= 0x2000 && r <= 0x200a
}

func jsTrim(s string) string {
	r := []rune(s)
	i, j := 0, len(r)
	for i < j && isJSWhitespace(r[i]) {
		i++
	}
	for j > i && isJSWhitespace(r[j-1]) {
		j--
	}
	return string(r[i:j])
}

// clip is the page's clip: trimmed, and past max UTF-16 units cut to
// max-1 with the elision shown.
func clip(s string, max int) string {
	u := utf16.Encode([]rune(jsTrim(s)))
	if len(u) <= max {
		return string(utf16.Decode(u))
	}
	return string(utf16.Decode(u[:max-1])) + "…"
}

// formatNumber is JavaScript's Number#toString.
func formatNumber(f float64) string {
	if f == 0 {
		return "0"
	}
	a := math.Abs(f)
	if a >= 1e21 || a < 1e-6 {
		s := strconv.FormatFloat(f, 'e', -1, 64)
		mant, exp, _ := strings.Cut(s, "e")
		sign := "+"
		if exp[0] == '-' {
			sign = "-"
		}
		exp = strings.TrimLeft(exp[1:], "0")
		return mant + "e" + sign + exp
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// jsString is String(v) over a decoded JSON value.
func jsString(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case bool:
		return strconv.FormatBool(x)
	case json.Number:
		f, _ := strconv.ParseFloat(string(x), 64)
		return formatNumber(f)
	case string:
		return x
	case []any:
		parts := make([]string, len(x))
		for i, e := range x {
			if e != nil {
				parts[i] = jsString(e)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

// text is `String(v ?? fallback)`: absent and null fall back.
func text(o map[string]any, key, fallback string) string {
	v, ok := o[key]
	if !ok || v == nil {
		return fallback
	}
	return jsString(v)
}

func normalise(raw any) (widget, bool) {
	o, ok := raw.(map[string]any)
	if !ok {
		return widget{}, false
	}
	id, ok := o["id"].(string)
	if !ok || id == "" {
		return widget{}, false
	}
	w := widget{ID: id, Source: "generated"}
	if kind, ok := o["kind"].(string); ok {
		w.Kind, w.Known = &kind, contains(descriptorKinds, kind)
	}
	w.Label = clip(text(o, "label", id), maxLabel)
	w.Noun = clip(text(o, "noun", ""), maxNoun)
	if g, ok := o["glyph"].(string); ok {
		if r := []rune(jsTrim(g)); len(r) == 1 {
			glyph := string(r)
			w.Glyph = &glyph
		}
	}
	if s, ok := o["source"].(string); ok && contains(descriptorSources, s) {
		w.Source = s
	}
	return w, true
}

// decodeJSON is JSON.parse for a text jsonSyntaxError passes: numbers kept
// as written, a repeated key's last value winning.
func decodeJSON(text []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(text))
	dec.UseNumber()
	var doc any
	err := dec.Decode(&doc)
	return doc, err
}

func faulted(pack, fault string) descriptor {
	return descriptor{Pack: pack, Fault: &fault}
}

// parseDescriptor reads a descriptor's text for pack.
func parseDescriptor(text []byte, pack string) descriptor {
	if msg := jsonSyntaxError(string(text)); msg != "" {
		return faulted(pack, "its dashboard.json is not valid JSON — "+msg)
	}
	doc, err := decodeJSON(text)
	if err != nil {
		return faulted(pack, "its dashboard.json is not valid JSON — "+err.Error())
	}
	o, ok := doc.(map[string]any)
	if !ok {
		return faulted(pack, "its dashboard.json is not an object")
	}
	raws, ok := o["widgets"].([]any)
	if !ok {
		return faulted(pack, "its dashboard.json declares no widgets array")
	}
	d := descriptor{Pack: pack, Widgets: []widget{}, Repo: []string{}}
	for _, raw := range raws {
		if w, ok := normalise(raw); ok && !d.declares(w.ID) {
			d.Widgets = append(d.Widgets, w)
		}
	}
	if len(d.Widgets) == 0 {
		return faulted(pack, "its dashboard.json declares no usable widget")
	}
	repo, _ := o["repo"].([]any)
	for _, id := range repo {
		if d.declares(id) {
			d.Repo = append(d.Repo, id.(string))
		}
	}
	if len(d.Repo) > maxRepoWidgets {
		d.Repo = d.Repo[:maxRepoWidgets]
	}
	return d
}
