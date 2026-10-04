package checks

import (
	"regexp"
	"strings"
	"unicode"

	"claudinite.com/checksdk"
)

var (
	tileSource = regexp.MustCompile(`(?i)\.(html?|mjs|cjs|jsx?|tsx?)$`)
	tileCall   = regexp.MustCompile(`\bL\.tileLayer\s*\(`)
	// outOfBand is Leaflet's documented credit path away from the layer.
	outOfBand   = regexp.MustCompile(`\baddAttribution\s*\(`)
	scriptBlock = regexp.MustCompile(`(?is)<script\b[^>]*>(.*?)</script\s*>`)
	objectKey   = regexp.MustCompile(`^\s*(?:'([A-Za-z_$][\w$]*)'|"([A-Za-z_$][\w$]*)"|([A-Za-z_$][\w$]*))\s*:`)
)

// blankComments is checksdk.StripComments that keeps every offset: a
// comment's characters become spaces, its newlines stay.
func blankComments(source string) string {
	out := []byte(source)
	const (
		code = iota
		line
		block
		sq
		dq
		tpl
	)
	state := code
	for i := 0; i < len(source); i++ {
		c := source[i]
		var c2 byte
		if i+1 < len(source) {
			c2 = source[i+1]
		}
		switch state {
		case code:
			switch {
			case c == '/' && c2 == '/':
				state = line
				out[i], out[i+1] = ' ', ' '
				i++
			case c == '/' && c2 == '*':
				state = block
				out[i], out[i+1] = ' ', ' '
				i++
			case c == '\'':
				state = sq
			case c == '"':
				state = dq
			case c == '`':
				state = tpl
			}
		case line:
			if c == '\n' {
				state = code
			} else {
				out[i] = ' '
			}
		case block:
			if c == '*' && c2 == '/' {
				state = code
				out[i], out[i+1] = ' ', ' '
				i++
			} else if c != '\n' {
				out[i] = ' '
			}
		default:
			if c == '\\' {
				i++
			} else if state == sq && c == '\'' || state == dq && c == '"' || state == tpl && c == '`' {
				state = code
			}
		}
	}
	return string(out)
}

// codeView is the JS the browser runs, all else blanked in place: for an
// HTML page, its inline script bodies only.
func codeView(file, raw string) string {
	if !htmlFile.MatchString(file) {
		return blankComments(raw)
	}
	noComments := stripHTMLComments(raw)
	out := []byte(blank(noComments))
	for _, m := range scriptBlock.FindAllStringSubmatchIndex(noComments, -1) {
		open := strings.Index(noComments[m[0]:], ">")
		if open < 0 {
			continue
		}
		start := m[0] + open + 1
		copy(out[start:], blankComments(noComments[m[2]:m[3]]))
	}
	return string(out)
}

var closers = map[byte]byte{'(': ')', '[': ']', '{': '}'}

// matchBracket is the index of the bracket closing src[open], or -1.
func matchBracket(src string, open int) int {
	stack := []byte{closers[src[open]]}
	for i := open + 1; i < len(src); i++ {
		c := src[i]
		if c == '"' || c == '\'' || c == '`' {
			for i++; i < len(src); i++ {
				if src[i] == '\\' {
					i++
				} else if src[i] == c {
					break
				}
			}
			continue
		}
		if closer, ok := closers[c]; ok {
			stack = append(stack, closer)
		} else if c == ')' || c == ']' || c == '}' {
			if stack[len(stack)-1] != c {
				return -1
			}
			stack = stack[:len(stack)-1]
			if len(stack) == 0 {
				return i
			}
		}
	}
	return -1
}

// splitTopLevel splits src[from:to] on the commas at this level, or ok
// false when a bracket there does not close inside it.
func splitTopLevel(src string, from, to int) ([]string, bool) {
	var parts []string
	start := from
	for i := from; i < to; i++ {
		c := src[i]
		if c == '"' || c == '\'' || c == '`' {
			for i++; i < to; i++ {
				if src[i] == '\\' {
					i++
				} else if src[i] == c {
					break
				}
			}
			continue
		}
		if _, ok := closers[c]; ok {
			end := matchBracket(src, i)
			if end == -1 || end >= to {
				return nil, false
			}
			i = end
			continue
		}
		if c == ',' {
			parts = append(parts, src[start:i])
			start = i + 1
		}
	}
	return append(parts, src[start:to]), true
}

// topLevelKeys are an object literal's own keys, or ok false when it does
// not close or a member spreads, which could carry attribution in.
func topLevelKeys(src string, open int) ([]string, bool) {
	end := matchBracket(src, open)
	if end == -1 {
		return nil, false
	}
	members, ok := splitTopLevel(src, open+1, end)
	if !ok {
		return nil, false
	}
	var keys []string
	for _, member := range members {
		trimmed := strings.TrimSpace(member)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "...") {
			return nil, false
		}
		if m := objectKey.FindStringSubmatch(member); m != nil {
			keys = append(keys, m[1]+m[2]+m[3])
		}
	}
	return keys, true
}

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "tile-attribution",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    doc,
		Why:    "the provider's attribution is a licence term, not decoration — an unattributed tile layer uses the tiles outside their terms, and nothing about the running map looks wrong, so a UI tidy-up drops it and no one notices",
		Run:    tileAttribution,
	})
}

func tileAttribution(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, file := range repo.Files() {
		if !tileSource.MatchString(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok || !strings.Contains(raw, "L.tileLayer") {
			continue
		}
		src := codeView(file, raw)
		if outOfBand.MatchString(src) {
			continue
		}
		for _, m := range tileCall.FindAllStringIndex(src, -1) {
			open := m[1] - 1
			end := matchBracket(src, open)
			if end == -1 {
				continue
			}
			args, ok := splitTopLevel(src, open+1, end)
			if !ok {
				continue
			}
			sentence := "builds an L.tileLayer with no options at all, so no `attribution`"
			if len(args) > 1 {
				// Options from a variable, a call or a spread are unreadable,
				// so their absence is not provable.
				if !strings.HasPrefix(strings.TrimSpace(args[1]), "{") {
					continue
				}
				lead := len(args[1]) - len(strings.TrimLeftFunc(args[1], unicode.IsSpace))
				keys, ok := topLevelKeys(src, open+1+len(args[0])+1+lead)
				if !ok || has(keys, "attribution") {
					continue
				}
				sentence = "builds an L.tileLayer with a literal options object that has no `attribution`"
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, m[0]),
				Sentence: sentence,
				Fix:      `add attribution to this layer's options — e.g. attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' — or, where the credit is genuinely supplied elsewhere, register it through map.attributionControl.addAttribution(...)`,
			})
		}
	}
	return out
}

func has(xs []string, x string) bool {
	for _, y := range xs {
		if y == x {
			return true
		}
	}
	return false
}
