// Package checks holds the firebase pack's coded checks.
package checks

import (
	"encoding/json"
	"fmt"
	"strings"

	"claudinite.com/checksdk"
)

// The predeploy build hook, so a deploy can never ship stale JS. A
// codebase whose package.json declares no build script compiles nothing,
// so it has no stale output to ship and the check does not apply to it.

func init() {
	checksdk.Register(checksdk.Check{
		ID:   "functions-predeploy-build",
		Tags: []string{"world"},
		Doc:  "packs/firebase/skills/firebase-functions/SKILL.md",
		Why:  "without the hook a deploy ships whatever compiled output happens to be on disk — a local `firebase deploy` after an edit silently publishes the previous build",
		Run:  functionsPredeployBuild,
	})
}

func hasHook(v any) bool {
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x) != ""
	case []any:
		for _, c := range x {
			if s, ok := c.(string); ok && strings.TrimSpace(s) != "" {
				return true
			}
		}
	}
	return false
}

func functionsPredeployBuild(repo checksdk.Repo) []checksdk.Finding {
	var out []checksdk.Finding
	for _, cb := range functionsCodebases(repo) {
		scripts, _ := cb.Manifest["scripts"].(map[string]any)
		if !truthy(scripts["build"]) || hasHook(cb.Entry["predeploy"]) {
			continue
		}
		out = append(out, checksdk.Finding{
			Path:     cb.ConfigFile,
			Sentence: fmt.Sprintf("the %q functions codebase declares a build script but no predeploy hook", cb.Source),
			Fix:      fmt.Sprintf(`add "predeploy": ["npm --prefix %s run build"] to that functions entry in %s`, cb.Source, cb.ConfigFile),
		})
	}
	return out
}

// truthy is v as JavaScript's truthiness reads a JSON value.
func truthy(v any) bool {
	switch x := v.(type) {
	case nil:
		return false
	case bool:
		return x
	case string:
		return x != ""
	case float64:
		return x != 0
	}
	return true
}

// A Firebase project root is the folder holding firebase.json, the repo
// root or one folder down (the pack's marker scope, so a nested fixture
// cannot drag checks in). The CLI resolves every path in firebase.json
// relative to that file.
func isProjectConfig(f string) bool {
	parts := strings.Split(f, "/")
	return parts[len(parts)-1] == "firebase.json" && len(parts) <= 2
}

type codebase struct {
	ConfigFile, Source, SourceDir, ManifestPath string
	Entry, Manifest                             map[string]any
}

func readObject(repo checksdk.Repo, rel string) (map[string]any, bool) {
	text, ok := repo.Read(rel)
	if !ok {
		return nil, false
	}
	var v any
	if json.Unmarshal([]byte(text), &v) != nil {
		return nil, false
	}
	m, ok := v.(map[string]any)
	return m, ok
}

// functionsCodebases are the functions codebases each project declares,
// resolved to the deployed package's own folder; one whose package.json
// this checkout lacks is dropped. functions is one object or a list, and
// source defaults to "functions", as the CLI's does. An unparsable config
// is the CLI's complaint, not this check's.
func functionsCodebases(repo checksdk.Repo) []codebase {
	var out []codebase
	for _, file := range repo.Tracked() {
		if !isProjectConfig(file) {
			continue
		}
		config, ok := readObject(repo, file)
		if !ok || config["functions"] == nil {
			continue
		}
		dir := ""
		if i := strings.LastIndex(file, "/"); i >= 0 {
			dir = file[:i]
		}
		declared, isList := config["functions"].([]any)
		if !isList {
			declared = []any{config["functions"]}
		}
		for _, e := range declared {
			entry, ok := e.(map[string]any)
			if !ok {
				continue
			}
			source, _ := entry["source"].(string)
			if source == "" {
				source = "functions"
			}
			sourceDir := source
			if dir != "" {
				sourceDir = dir + "/" + source
			}
			manifest, ok := readObject(repo, sourceDir+"/package.json")
			if !ok {
				continue
			}
			out = append(out, codebase{ConfigFile: file, Source: source, SourceDir: sourceDir, ManifestPath: sourceDir + "/package.json", Entry: entry, Manifest: manifest})
		}
	}
	return out
}
