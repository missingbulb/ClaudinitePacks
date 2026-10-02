// Package fixture runs a pack's declared checks the way a member does: a
// fresh git repo holding the pack vendored and declared, checked by the cn
// CLAUDINITE_CN names, with the findings compared to the case's. A pack's
// test/ holds its cases; tools/checks/test.sh runs them with the pack Go
// tests.
package fixture

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"testing"
)

// Case is one member tree and the findings the pack under test must
// report on it.
type Case struct {
	Name string
	// Config is the pack's entry config; Also are further packs declared
	// and vendored beside it.
	Config map[string]any
	Also   []string
	// Rules are the member's checks.rules overrides.
	Rules map[string]string
	// Member is committed on main; Change, when set, on branch change,
	// with Deleted removed there and Message as its commit message.
	Member, Change map[string]string
	Deleted        []string
	Message        string
	// Untracked is laid over the result and left uncommitted.
	Untracked map[string]string
	// Transcript is the session's JSONL, one entry per line.
	Transcript []string
	// Tag runs `cn check --tag` instead of the pack's own checks.
	Tag string
	// Expect is each of the pack's findings as "<class> <id> <path>[:<line>]",
	// in any order; none means the case is silent.
	Expect []string
}

var (
	cacheOnce sync.Once
	cacheDir  string
	findingRe = regexp.MustCompile(`^(finding|advisory|break|deprecation) (\S+) (.*?): `)
)

func root() string {
	_, self, _, _ := runtime.Caller(0)
	return filepath.Clean(filepath.Join(filepath.Dir(self), "..", "..", ".."))
}

func write(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for rel, text := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func git(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false"}, args...)...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
}

func copyDir(t *testing.T, src, dst string) {
	t.Helper()
	err := filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(src, p)
		if d.IsDir() {
			return os.MkdirAll(filepath.Join(dst, rel), 0o755)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(dst, rel), b, 0o644)
	})
	if err != nil {
		t.Fatal(err)
	}
}

// Run checks each case against pack's declared and coded checks.
func Run(t *testing.T, pack string, cases []Case) {
	cn := os.Getenv("CLAUDINITE_CN")
	if cn == "" {
		t.Skip("CLAUDINITE_CN is not set; tools/checks/test.sh sets it")
	}
	cacheOnce.Do(func() {
		cacheDir, _ = os.MkdirTemp("", "claudinitepacks-fixture-cache")
	})
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			got := check(t, cn, pack, c)
			want := append([]string{}, c.Expect...)
			sort.Strings(want)
			if strings.Join(got, "\n") != strings.Join(want, "\n") {
				t.Errorf("findings:\n  %s\nwant:\n  %s", strings.Join(got, "\n  "), strings.Join(want, "\n  "))
			}
		})
	}
}

func check(t *testing.T, cn, pack string, c Case) []string {
	t.Helper()
	dir := t.TempDir()
	write(t, dir, c.Member)
	entry := map[string]any{"id": pack}
	if c.Config != nil {
		entry["config"] = c.Config
	}
	declared := []any{entry}
	for _, id := range append([]string{pack}, c.Also...) {
		copyDir(t, filepath.Join(root(), "packs", id), filepath.Join(dir, ".claudinite", "shared", "packs", id))
		if id != pack {
			declared = append(declared, id)
		}
	}
	settings := map[string]any{
		"engine": map[string]any{"version": "0.0.0", "manifest": "sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="},
		"packs":  map[string]any{"declared": declared},
	}
	if c.Rules != nil {
		settings["checks"] = map[string]any{"rules": c.Rules}
	}
	raw, _ := json.MarshalIndent(settings, "", "  ")
	write(t, dir, map[string]string{".claudinite/settings.json": string(raw) + "\n"})
	git(t, dir, "init", "-q", "-b", "main")
	git(t, dir, "add", "-A")
	git(t, dir, "commit", "-q", "--allow-empty", "-m", "base")
	if c.Change != nil || c.Deleted != nil {
		git(t, dir, "checkout", "-q", "-b", "change")
		write(t, dir, c.Change)
		for _, p := range c.Deleted {
			if err := os.Remove(filepath.Join(dir, filepath.FromSlash(p))); err != nil {
				t.Fatal(err)
			}
		}
		msg := c.Message
		if msg == "" {
			msg = "change"
		}
		git(t, dir, "add", "-A")
		git(t, dir, "commit", "-q", "--allow-empty", "-m", msg)
	}
	write(t, dir, c.Untracked)
	args := []string{"check", "--repo", dir}
	if c.Tag != "" {
		args = append(args, "--tag", c.Tag)
	} else {
		args = append(args, "--pack", pack)
	}
	if c.Transcript != nil {
		p := filepath.Join(t.TempDir(), "session.jsonl")
		if err := os.WriteFile(p, []byte(strings.Join(c.Transcript, "\n")+"\n"), 0o644); err != nil {
			t.Fatal(err)
		}
		args = append(args, "--transcript", p)
	}
	cmd := exec.Command(cn, args...)
	cmd.Env = append(os.Environ(), "CLAUDINITE_CHECKS_NO_FETCH=1", "XDG_CACHE_HOME="+cacheDir, "CLAUDE_PROJECT_DIR="+dir)
	out, err := cmd.Output()
	if ee, ok := err.(*exec.ExitError); err != nil && (!ok || ee.ExitCode() != 1) {
		t.Fatalf("cn %v: %v\n%s\n%s", args, err, out, ee.Stderr)
	}
	var got []string
	for _, l := range strings.Split(string(out), "\n") {
		m := findingRe.FindStringSubmatch(l)
		if m == nil || !strings.HasPrefix(m[2], pack+"/") {
			continue
		}
		got = append(got, m[1]+" "+strings.TrimPrefix(m[2], pack+"/")+" "+m[3])
	}
	sort.Strings(got)
	return got
}
