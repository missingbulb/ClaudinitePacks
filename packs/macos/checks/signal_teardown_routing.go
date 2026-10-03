package checks

import (
	"regexp"
	"strings"

	"claudinite.com/checksdk"
)

var (
	swiftFile = regexp.MustCompile(`\.swift$`)
	signals   = []string{"SIGTERM", "SIGINT", "SIGHUP"}
	// appKit: only an app with an NSApplication has NSApp.terminate to
	// route into; tap: a capture tap registers the IOProc at stake.
	appKit     = regexp.MustCompile(`\bNSApplicationDelegate\b|\bNSApplicationMain\b|\bNSApp\b`)
	tap        = regexp.MustCompile(`\binstallTap\s*\(`)
	makeSource = regexp.MustCompile(`\bmakeSignalSource\s*\(`)
	routing    = []*regexp.Regexp{
		makeSource,
		regexp.MustCompile(`\bsigaction\s*\(`),
		regexp.MustCompile(`\bsignal\s*\(\s*(?:` + strings.Join(signals, "|") + `)\b`),
	}
	sigIgn = regexp.MustCompile(`\bsignal\s*\([^)]*SIG_IGN`)
	resume = regexp.MustCompile(`\.resume\s*\(\s*\)`)
)

func init() {
	checksdk.Register(checksdk.Check{
		ID:     "signal-teardown-routing",
		Tags:   []string{"world"},
		OnFail: "block",
		Doc:    "packs/macos/RULES.md",
		Why:    "NSApplication installs no signal handlers, so an unrouted SIGTERM/SIGINT/SIGHUP kills the process with no teardown and abandons the capture tap's IOProc on the device — the state that wedges some USB input devices until they are re-plugged",
		Run:    signalTeardownRouting,
	})
}

type source struct{ file, text string }

// search is the offset of re's first match in text, or -1.
func search(re *regexp.Regexp, text string) int {
	if loc := re.FindStringIndex(text); loc != nil {
		return loc[0]
	}
	return -1
}

func signalTeardownRouting(repo checksdk.Repo) []checksdk.Finding {
	var sources []source
	for _, file := range repo.Files() {
		if !swiftFile.MatchString(file) {
			continue
		}
		if text, ok := repo.Read(file); ok {
			sources = append(sources, source{file, checksdk.StripComments(text)})
		}
	}
	isApp, tapAt := false, -1
	var routed []source
	for i, s := range sources {
		isApp = isApp || appKit.MatchString(s.text)
		if tapAt < 0 && tap.MatchString(s.text) {
			tapAt = i
		}
		for _, r := range routing {
			if r.MatchString(s.text) {
				routed = append(routed, s)
				break
			}
		}
	}
	if !isApp || tapAt < 0 {
		return nil
	}
	if len(routed) == 0 {
		s := sources[tapAt]
		return []checksdk.Finding{{
			Path:     s.file,
			Line:     lineOf(s.text, search(tap, s.text)),
			Sentence: "a capture tap is installed in " + s.file + " but nothing in the sources routes termination signals to NSApp.terminate",
			Fix:      "map [SIGTERM, SIGINT, SIGHUP] to `DispatchSource.makeSignalSource(signal:queue:)` handlers that call `NSApp.terminate(nil)` — calling `signal(sig, SIG_IGN)` before `resume()`, and holding the sources in a top-level `let` so they outlive setup",
		}}
	}
	var out []checksdk.Finding
	var unrouted []string
	for _, sig := range signals {
		named := regexp.MustCompile(`\b` + sig + `\b`)
		found := false
		for _, s := range sources {
			if named.MatchString(s.text) {
				found = true
				break
			}
		}
		if !found {
			unrouted = append(unrouted, sig)
		}
	}
	if len(unrouted) > 0 {
		s := routed[0]
		names := strings.Join(unrouted, ", ")
		out = append(out, checksdk.Finding{
			Path:     s.file,
			Line:     lineOf(s.text, max(search(makeSource, s.text), 0)),
			Sentence: "signal routing exists but " + names + " appears nowhere in the sources",
			Fix:      "route " + names + " the same way as the signals already handled — each of them is fatal by default and leaves the tap installed",
		})
	}
	// SIG_IGN must precede the first resume() after the first signal
	// source, an earlier unrelated resume() being none of this rule's.
	for _, s := range routed {
		setup := search(makeSource, s.text)
		if setup < 0 {
			continue
		}
		loc := resume.FindStringIndex(s.text[setup:])
		if loc == nil {
			continue
		}
		resumed := setup + loc[0]
		ignore := search(sigIgn, s.text)
		if ignore >= 0 && ignore < resumed {
			continue
		}
		sentence := s.file + " calls signal(…, SIG_IGN) only after resume()"
		if ignore < 0 {
			sentence = s.file + " resumes a signal source without ever calling signal(…, SIG_IGN)"
		}
		out = append(out, checksdk.Finding{
			Path:     s.file,
			Line:     lineOf(s.text, resumed),
			Sentence: sentence,
			Fix:      "call `signal(sig, SIG_IGN)` before `source.resume()` — until the default action is ignored, a signal arriving in the gap still terminates the process outright",
		})
	}
	return out
}
