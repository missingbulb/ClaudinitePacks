// Package checks holds leaflet's checks, each parsed rather than grepped:
// the tag or the call site the rule is about is read, and only its own
// attributes or options are judged.
package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

const doc = "packs/leaflet/RULES.md"

var (
	htmlFile    = regexp.MustCompile(`(?i)\.html?$`)
	tagRE       = regexp.MustCompile(`(?i)<(script|link)\b([^>]*)>`)
	remoteURL   = regexp.MustCompile(`(?i)^(?:https?:)?\/\/`)
	leafletWord = regexp.MustCompile(`(?i)leaflet`)
	// pinned is an exact major.minor version reached by the URL's own
	// delimiters: leaflet@1.9.4/, /leaflet/1.9.4/, leaflet-1.9.4.js.
	pinned      = regexp.MustCompile(`[@/-]\d+\.\d+[\w.+-]*(?:$|[/?#])`)
	sri         = regexp.MustCompile(`^sha(?:256|384|512)-\S+`)
	htmlComment = regexp.MustCompile(`(?s)<!--.*?-->`)
	attribute   = regexp.MustCompile(`([a-zA-Z_:][-\w:.]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?`)
)

// blank is s with every character but a newline a space, so offsets and
// line numbers survive.
func blank(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c != '\n' {
			b[i] = ' '
		}
	}
	return string(b)
}

func stripHTMLComments(src string) string { return htmlComment.ReplaceAllStringFunc(src, blank) }

// attributes are a tag's own attributes by lowercased name; a valueless
// one maps to "", present.
func attributes(text string) map[string]string {
	attrs := map[string]string{}
	for _, m := range attribute.FindAllStringSubmatch(text, -1) {
		raw := m[2]
		if strings.HasPrefix(raw, `"`) || strings.HasPrefix(raw, "'") {
			raw = raw[1 : len(raw)-1]
		}
		attrs[strings.ToLower(m[1])] = raw
	}
	return attrs
}

func lineOf(text string, index int) int { return strings.Count(text[:index], "\n") + 1 }

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "asset-integrity",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    doc,
		Why:    "an un-pinned or un-hashed third-party script runs with the page's full authority, so whatever the CDN serves tomorrow is what your users execute — and the hole is usually a plugin tag left bare beside a correctly wired core bundle",
		Run:    assetIntegrity,
	})
}

func assetIntegrity(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, file := range repo.Files() {
		if !htmlFile.MatchString(file) {
			continue
		}
		raw, ok := repo.Read(file)
		if !ok || !leafletWord.MatchString(raw) {
			continue
		}
		src := stripHTMLComments(raw)
		for _, m := range tagRE.FindAllStringSubmatchIndex(src, -1) {
			tag := strings.ToLower(src[m[2]:m[3]])
			attrs := attributes(src[m[4]:m[5]])
			url := attrs["href"]
			if tag == "script" {
				url = attrs["src"]
			}
			if url == "" || !remoteURL.MatchString(url) || !leafletWord.MatchString(url) {
				continue
			}
			var missing []string
			if !pinned.MatchString(url) {
				missing = append(missing, "an exact version pin (leaflet@1.9.4, never @latest)")
			}
			if !sri.MatchString(attrs["integrity"]) {
				missing = append(missing, `integrity="sha256-…"`)
			}
			if _, ok := attrs["crossorigin"]; !ok {
				missing = append(missing, "crossorigin")
			}
			if len(missing) == 0 {
				continue
			}
			out = append(out, checksdk.Finding{
				Path:     file,
				Line:     lineOf(src, m[0]),
				Sentence: "loads the Leaflet asset " + url + " without " + strings.Join(missing, " / "),
				Fix:      `pin the exact version in the URL and carry integrity="sha256-…" + crossorigin="" on this <` + tag + `> — the plugin tags too, not just the core bundle`,
			})
		}
	}
	return out
}
