package checks

import (
	"strings"
	"testing"

	"claudinite.com/checksdk"
)

type tcase struct{ name, src, want, says string }

func runCases(t *testing.T, check func(checksdk.Repo) []checksdk.Finding, cases []tcase) {
	t.Helper()
	for _, c := range cases {
		fs := run(t, check, map[string]string{"src/a.js": c.src}, nil)
		expect(t, c.name, fs, c.want)
		if !strings.Contains(said(fs), c.says) {
			t.Errorf("%s: said %q, want %q", c.name, said(fs), c.says)
		}
	}
}

func TestMicCaptureReleased(t *testing.T) {
	open := "export async function warm() {\n  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });\n"
	runCases(t, micCaptureReleased, []tcase{
		{"never stopped", open + "  return stream.getAudioTracks()[0].getSettings();\n}\n", "src/a.js:2", "never stops its tracks"},
		{"stopped in finally", open + "  try { return 1; } finally {\n    stream.getTracks().forEach((t) => t.stop());\n  }\n}\n", "", ""},
		{"named only in a comment", "// navigator.mediaDevices.getUserMedia({ audio: true })\n", "", ""},
	})
	expect(t, "a test file", run(t, micCaptureReleased, map[string]string{"src/a.test.js": open + "}\n"}, nil), "")
}

func TestMicConstraintsNotScreenCapture(t *testing.T) {
	runCases(t, micConstraintsNotScreenCapture, []tcase{
		{"inline", "export const open = () => navigator.mediaDevices.getUserMedia({\n  audio: { echoCancellation: true, suppressLocalAudioPlayback: true },\n});\n", "src/a.js:2", "asks for suppressLocalAudioPlayback"},
		{"through a declaration", "const constraints = {\n  audio: { restrictOwnAudio: true },\n};\nnavigator.mediaDevices.getUserMedia(constraints);\nnavigator.mediaDevices.getUserMedia(constraints);\n", "src/a.js:2", "restrictOwnAudio"},
		{"getDisplayMedia", "export const capture = () => navigator.mediaDevices.getDisplayMedia({\n  audio: { suppressLocalAudioPlayback: true },\n});\n", "", ""},
		{"an unrelated declaration", "const tab = { audio: { suppressLocalAudioPlayback: true } };\nnavigator.mediaDevices.getUserMedia({ audio: true });\n", "", ""},
	})
}

func TestSttErrorMapHasDefault(t *testing.T) {
	sw := "export function kindOf(name) {\n  switch (name) {\n    case 'not-allowed': return 'permission-denied';\n    case \"no-speech\": return 'nothing-heard';\n    case `network`: return 'offline';\n"
	runCases(t, sttErrorMapHasDefault, []tcase{
		{"no default", sw + "  }\n}\n", "src/a.js:2", "(no-speech, network, not-allowed) has no default arm"},
		{"a default", sw + "    default: return 'other';\n  }\n}\n", "", ""},
		{"a return after", sw + "  }\n  ; return 'other';\n}\n", "", ""},
		{"a dispatch", "switch (e.error) {\n  case 'no-speech': retry(); break;\n  case 'network': offline(); break;\n}\n", "", ""},
		{"a nested default does not count", "switch (n) {\n  case 'no-speech': return 1;\n  case 'aborted': switch (x) { default: return 2; }\n}\n", "src/a.js:1", ""},
		{"one name is no mapping", "switch (n) {\n  case 'no-speech': return 1;\n  case 'other': return 2;\n}\n// network\n", "", ""},
	})
}

func TestSttInterimResultsGated(t *testing.T) {
	runCases(t, sttInterimResultsGated, []tcase{
		{"interim delivered", "const rec = new webkitSpeechRecognition();\nrec.interimResults = true;\nrec.onresult = (event) => {\n  deliver(event.results[0][0].transcript);\n};\n", "src/a.js:2", "never checks isFinal"},
		{"gated on isFinal", "rec.interimResults = true;\nrec.onresult = (event) => {\n  if (event.results[0].isFinal) deliver();\n};\n", "", ""},
		{"interim off", "rec.interimResults = false;\nrec.addEventListener('result', function (e) { deliver(e); });\n", "", ""},
		{"a comparison is no setting", "if (rec.interimResults === true) {}\nrec.onresult = async (e) => deliver(e);\n", "", ""},
		{"off then on, in an object", "const a = { interimResults: 0 };\nconst b = { interimResults:\n  opts.interim };\nrec.onresult = e => deliver(e);\n", "src/a.js:2", ""},
		{"a named handler", "rec.interimResults = true;\nrec.onresult = handleResult;\n", "", ""},
	})
}

func TestSttTerminalHandlers(t *testing.T) {
	runCases(t, sttTerminalHandlers, []tcase{
		{"result alone", "const rec = new webkitSpeechRecognition();\nrec.onresult = (event) => deliver(event);\nrec.start();\n", "src/a.js:2", "handles result but never end or error"},
		{"error missing", "rec.addEventListener(`result`, f);\nrec.onend = g;\n", "src/a.js:1", "never error"},
		{"both forms mixed", "rec.onresult = (e) => deliver(e);\nrec.addEventListener('end', () => settle());\nrec.addEventListener('error', (e) => settle(e));\n", "", ""},
	})
}

func TestTtsSpeakSettles(t *testing.T) {
	runCases(t, ttsSpeakSettles, []tcase{
		{"only end", "export const say = (text) => new Promise((resolve) => {\n  chrome.tts.speak(text, {\n    enqueue: false,\n    onEvent(event) { if (event.type === 'end') resolve(); },\n  });\n});\n", "src/a.js:2", "never settles on interrupted/cancelled/error"},
		{"every terminal", "chrome.tts.speak(text, {\n  onEvent(event) {\n    if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) resolve();\n  },\n});\n", "", ""},
		{"an utterance without error", "const utterance = new SpeechSynthesisUtterance(text);\nutterance.onend = () => resolve();\nspeechSynthesis.speak(utterance);\n", "src/a.js:1", "no error handler"},
		{"a wrapper with no onEvent", "export const prompt = (line) => say(line, { rate: 1.1 });\nx.speak(line);\n", "", ""},
		{"an onEvent naming no terminal", "chrome.tts.speak(t, { onEvent: log });\n", "", ""},
	})
}
