package checks

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"claudinite.com/checksdk"
)

// A shelf pack's provenance/VERSIONS.md rows run newest-first. The history
// task sorts what it writes, but a row a person adds lands wherever they
// put it. World scope: ordering is a property of the whole file, which no
// one diff sees.
func init() {
	checksdk.Register(checksdk.Check{
		ID:   "pack-version-log-ordered",
		Tags: []string{"world"},
		Doc:  "packs/claudinite-canon-curation/README.md",
		Why:  "a reader trusts a VERSIONS.md row's position to say its age; once the tail drifts out of sequence a number near the bottom could be old or merely misplaced, and nothing short of re-deriving the order from the numbers themselves can tell which",
		Run:  versionLog,
	})
}

var (
	versionRow = regexp.MustCompile(`^\|\s*(\d+(?:\.\d+)*)\s*\|`)
	dayOrdinal = regexp.MustCompile(`^([1-9]\d{4,5}\.[1-9]\d*|\d+)$`)
	plainNum   = regexp.MustCompile(`^(0|[1-9]\d*)$`)
)

// isDay reports whether d has a month and a day of the month in the
// (year-2020)*10000 + month*100 + day layout.
func isDay(d uint64) bool {
	month, day := d/100%100, d%100
	return month >= 1 && month <= 12 && day >= 1 && day <= 31
}

// releaseForm reports whether s is a <major>.<day>.<n> release version.
func releaseForm(s string) bool {
	parts := strings.Split(s, ".")
	if len(parts) != 3 {
		return false
	}
	var n [3]uint64
	for i, p := range parts {
		if !plainNum.MatchString(p) {
			return false
		}
		v, err := strconv.ParseUint(p, 10, 64)
		if err != nil {
			return false
		}
		n[i] = v
	}
	return isDay(n[1]) && n[2] > 0
}

// rowVersion is a VERSIONS.md line's version: a <major>.<day>.<n>, or an
// earlier date-anchored <day>.<n> or bare integer, which comparePack sorts
// below it. Any other number in the first column is not a version.
func rowVersion(line string) (string, bool) {
	m := versionRow.FindStringSubmatch(strings.TrimSpace(line))
	if m == nil {
		return "", false
	}
	if dayOrdinal.MatchString(m[1]) || releaseForm(m[1]) {
		return m[1], true
	}
	return "", false
}

// comparePack orders two pack versions: the <major>.<day>.<n> form sorts
// above every other dot-separated form, and within either form segments
// compare as numbers of any size, the shorter first where one is a prefix
// of the other.
func comparePack(a, b string) int {
	if ra, rb := releaseForm(a), releaseForm(b); ra != rb {
		if ra {
			return 1
		}
		return -1
	}
	x, y := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(x) || i < len(y); i++ {
		switch {
		case i >= len(x):
			return -1
		case i >= len(y):
			return 1
		}
		p, q := strings.TrimLeft(x[i], "0"), strings.TrimLeft(y[i], "0")
		switch {
		case len(p) != len(q):
			if len(p) < len(q) {
				return -1
			}
			return 1
		case p < q:
			return -1
		case p > q:
			return 1
		}
	}
	return 0
}

func versionLog(repo checksdk.Repo) []checksdk.Finding {
	type claim struct {
		text string
		line int
	}
	var out []checksdk.Finding
	for _, f := range repo.Files() {
		parts := strings.Split(f, "/")
		if len(parts) != 4 || parts[0] != "packs" || parts[2] != "provenance" || parts[3] != "VERSIONS.md" {
			continue
		}
		text, _ := repo.Read(f)
		var claims []claim
		for i, l := range strings.Split(text, "\n") {
			if v, ok := rowVersion(l); ok {
				claims = append(claims, claim{v, i + 1})
			}
		}
		for i := 1; i < len(claims); i++ {
			prev, cur := claims[i-1], claims[i]
			if comparePack(cur.text, prev.text) > 0 {
				out = append(out, checksdk.Finding{Path: f, Line: cur.line,
					Sentence: fmt.Sprintf("version %s sits below %s (line %d) but is newer — VERSIONS.md rows must run newest-first", cur.text, prev.text, prev.line),
					Fix:      fmt.Sprintf("move the row for %s above line %d, so rows descend by version top to bottom", cur.text, prev.line)})
			}
		}
	}
	return out
}
