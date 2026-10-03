package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

const mv3 = `{"manifest_version": 3, "background": {"service_worker": "background.js"}}` + "\n"

func TestPack(t *testing.T) {
	fixture.Run(t, "web-speech", []fixture.Case{
		{Name: "tts-voices-cached-empty flags getVoices cached at module scope",
			Member: map[string]string{"src/voice.js": "const voices = window.speechSynthesis.getVoices();\nexport const pick = () => voices[0];\n"},
			Expect: []string{"finding tts-voices-cached-empty src/voice.js:1"}},
		{Name: "a cache refreshed on voiceschanged, or one in a test, is quiet",
			Member: map[string]string{
				"src/voice.js":      "let voices = speechSynthesis.getVoices();\nspeechSynthesis.addEventListener('voiceschanged', () => { voices = speechSynthesis.getVoices(); });\n",
				"src/voice.test.js": "const v = speechSynthesis.getVoices();\n",
			}},
		{Name: "web-speech-no-window-api-in-service-worker flags recognition and synthesis in the MV3 worker",
			Member: map[string]string{"extension/manifest.json": mv3, "extension/background.js": "chrome.runtime.onInstalled.addListener(() => {});\nconst rec = new webkitSpeechRecognition();\nspeechSynthesis.cancel();\n"},
			Expect: []string{"advisory web-speech-recognition-feature-detected extension/background.js:2", "finding web-speech-no-window-api-in-service-worker extension/background.js:2", "finding web-speech-no-window-api-in-service-worker extension/background.js:3"}},
		{Name: "chrome.tts in the worker and an MV2 background are quiet",
			Member: map[string]string{
				"a/manifest.json": mv3, "a/background.js": "chrome.tts.speak('hi', { enqueue: false });\n",
				"b/manifest.json": `{"manifest_version": 2, "background": {"service_worker": "background.js"}}` + "\n", "b/background.js": "const rec = new SpeechRecognition();\n",
			}},
		{Name: "web-speech-recognition-feature-detected advises on a bare webkit constructor, and web-speech-capture-released-on-pagehide blocks the open mic",
			Member: map[string]string{"src/listen.js": "const rec = new webkitSpeechRecognition();\nrec.onresult = f;\nrec.onend = g;\nrec.onerror = h;\nrec.start();\n"},
			Expect: []string{"advisory web-speech-recognition-feature-detected src/listen.js:1", "finding web-speech-capture-released-on-pagehide src/listen.js:1"}},
		{Name: "a feature-detected recognizer released on pagehide is quiet",
			Member: map[string]string{"src/listen.js": "const R = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;\nconst rec = new R();\nrec.onresult = f;\nrec.onend = g;\nrec.onerror = h;\nrec.start();\naddEventListener('pagehide', () => rec.abort());\n"}},
		{Name: "the coded checks fire through the pack",
			Member: map[string]string{"src/mic.js": "const s = await navigator.mediaDevices.getUserMedia({ audio: { restrictOwnAudio: true } });\naddEventListener('pagehide', () => {});\n"},
			Expect: []string{"finding mic-capture-released src/mic.js:1", "finding mic-constraints-not-screen-capture src/mic.js:1"}},
	})
}
