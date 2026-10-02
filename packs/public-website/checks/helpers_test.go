package checks

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

// tree writes files under a fresh root and returns it.
func tree(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for rel, text := range files {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(text), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// run is check's findings over files with the fake engine f (nil: one
// that answers from the files alone).
func run(t *testing.T, check func(checksdk.Repo) []checksdk.Finding, files map[string]string, f *checksdk.Fake) []checksdk.Finding {
	t.Helper()
	if f == nil {
		f = &checksdk.Fake{}
	}
	return check(f.Repo(tree(t, files)))
}

// at is each finding as path:line, sorted.
func at(fs []checksdk.Finding) string {
	var out []string
	for _, f := range fs {
		s := f.Path
		if f.Line > 0 {
			s += ":" + itoa(f.Line)
		}
		out = append(out, s)
	}
	sort.Strings(out)
	return strings.Join(out, " ")
}

func itoa(n int) string {
	s := ""
	for {
		s = string(rune('0'+n%10)) + s
		n /= 10
		if n == 0 {
			return s
		}
	}
}

func expect(t *testing.T, name string, fs []checksdk.Finding, want string) {
	t.Helper()
	if got := at(fs); got != want {
		t.Errorf("%s: findings at %q, want %q\n%+v", name, got, want, fs)
	}
}
