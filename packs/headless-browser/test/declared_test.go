package test

import (
	"maps"
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

func with(base map[string]string, files map[string]string) map[string]string {
	out := maps.Clone(base)
	maps.Copy(out, files)
	return out
}

// blocking sets check to block in every case, so a block check still
// inside its grace window reports as it will once the window closes.
func blocking(check string, cases []fixture.Case) []fixture.Case {
	for i := range cases {
		cases[i].Rules = map[string]string{check: "block"}
	}
	return cases
}

func TestNetworkidleWait(t *testing.T) {
	const id = "finding headless-browser/networkidle-wait "
	fixture.Run(t, "headless-browser", blocking("headless-browser/networkidle-wait", []fixture.Case{
		{Name: "a navigation waiting for the network to go quiet", Member: map[string]string{
			"capture/shoot.mjs": "import { chromium } from 'playwright-core';\n" +
				"const page = await (await chromium.launch()).newPage();\n" +
				"await page.goto('https://fake.test/', { waitUntil: 'networkidle' });\n",
		}, Expect: []string{id + "capture/shoot.mjs:3"}},
		{Name: "puppeteer's numbered spelling of the same wait", Member: map[string]string{
			"test/visual.spec.ts": "await page.goto(url, { waitUntil: 'networkidle2' });\n",
		}, Expect: []string{id + "test/visual.spec.ts:1"}},
		{Name: "a standalone load-state wait", Member: map[string]string{
			"capture/shoot.mjs": "await page.waitForLoadState('networkidle');\n",
		}, Expect: []string{id + "capture/shoot.mjs:1"}},
		{Name: "waiting on a selector the page only renders with its data (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": "await page.goto('https://fake.test/', { waitUntil: 'domcontentloaded' });\n" +
				"await page.waitForSelector('[data-loaded]');\n",
		}},
		{Name: "a comment naming the wait it warns against (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": "// Never waitUntil: 'networkidle' here — it returns before the slow read lands.\n" +
				"await page.waitForSelector('[data-loaded]');\n",
		}},
		{Name: "a vendored driver carrying the option name (FP guard)", Member: map[string]string{
			"node_modules/playwright-core/lib/waits.js": "const STATES = ['load', 'networkidle'];\n",
		}},
		{Name: "prose about the wait, outside the scanned sources (FP guard)", Member: map[string]string{
			"docs/capture.md": "Never wait on `networkidle`.\n",
		}},
		{Name: "the check's own fixtures, whose job is to spell the banned wait (FP guard)", Member: map[string]string{
			"packs/headless-browser/test/networkidle-wait.test.mjs": "at: [{ file: 'capture/shoot.mjs', line: 1 }],\n" +
				"'capture/shoot.mjs': \"await page.waitForLoadState('networkidle');\\n\",\n",
		}},
	}))
}

func TestCaptureWithoutFontWait(t *testing.T) {
	const id = "advisory headless-browser/capture-without-font-wait "
	// A tracked reference image is what makes the rule relevant: without one
	// there is nothing for a capture to be compared against.
	golden := map[string]string{"__screenshots__/home.png": "\u0089PNG\r\n\x1a\n"}
	fixture.Run(t, "headless-browser", []fixture.Case{
		{Name: "a capture harness that never asks whether the fonts have landed", Member: with(golden, map[string]string{
			"capture/shoot.mjs": "await page.waitForSelector('[data-loaded]');\n" +
				"await page.screenshot({ path: '__screenshots__/home.png' });\n",
		}), Expect: []string{id + "capture/shoot.mjs:2"}},
		{Name: "each harness file capturing without the wait", Member: with(golden, map[string]string{
			"capture/home.mjs": "await page.screenshot({ path: 'home.png' });\n",
			"capture/about.ts": "await page.screenshot({ path: 'about.png' });\n",
		}), Expect: []string{id + "capture/about.ts:1", id + "capture/home.mjs:1"}},
		{Name: "the harness awaits font readiness before the shot (FP guard)", Member: with(golden, map[string]string{
			"capture/shoot.mjs": "await page.evaluate(() => document.fonts.ready);\n" +
				"await page.screenshot({ path: '__screenshots__/home.png' });\n",
		})},
		{Name: "the wait lives in a helper the capture file imports (FP guard)", Member: with(golden, map[string]string{
			"capture/settle.mjs": "export const settle = (page) => page.waitForFunction(() => document.fonts.status === 'loaded');\n",
			"capture/shoot.mjs": "import { settle } from './settle.mjs';\n" +
				"await settle(page);\n" +
				"await page.screenshot({ path: '__screenshots__/home.png' });\n",
		})},
		{Name: "a repo that compares nothing against a reference image (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": "await page.screenshot({ path: '/tmp/debug.png' });\n",
		}},
		{Name: "the check's own fixtures, whose job is to spell a capture (FP guard)", Member: with(golden, map[string]string{
			"packs/headless-browser/test/capture-without-font-wait.test.mjs": "'capture/shoot.mjs': \"await page.screenshot({ path: 'home.png' });\\n\",\n",
		})},
		{Name: "a harness that drives the page without capturing it (FP guard)", Member: with(golden, map[string]string{
			"capture/drive.mjs": "await page.click('[data-open]');\n",
		})},
	})
}

func TestInsecureFakeOrigin(t *testing.T) {
	const id = "finding headless-browser/insecure-fake-origin "
	// Route interception is what makes a file a fake origin's harness: a URL
	// it navigates to is served from disk rather than fetched, so the scheme
	// is a free choice and `http` is the one that costs the page its
	// secure-origin capabilities.
	const route = "await page.route('**/*', (r) => r.fulfill({ body: '<html></html>' }));\n"
	fixture.Run(t, "headless-browser", blocking("headless-browser/insecure-fake-origin", []fixture.Case{
		{Name: "the navigation names an http origin", Member: map[string]string{
			"capture/shoot.mjs": route + "await page.goto('http://fake.test/home');\n",
		}, Expect: []string{id + "capture/shoot.mjs:2"}},
		{Name: "the origin reaches the navigation through a constant", Member: map[string]string{
			"capture/shoot.mjs": "const BASE = 'http://acme.test';\n" + route + "await page.goto(`${BASE}/home`);\n",
		}, Expect: []string{id + "capture/shoot.mjs:1"}},
		{Name: "a context configured with an http baseURL", Member: map[string]string{
			"capture/shoot.ts": route + "const ctx = await browser.newContext({ baseURL: 'http://acme.test' });\n",
		}, Expect: []string{id + "capture/shoot.ts:2"}},
		{Name: "an https fake origin (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": route + "await page.goto('https://fake.test/home');\n",
		}},
		{Name: "loopback, which browsers already treat as a secure origin (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": route +
				"await page.goto('http://localhost:4173/');\n" +
				"await page.goto('http://127.0.0.1:4173/');\n" +
				"await page.goto('http://[::1]:4173/');\n",
		}},
		{Name: "an http host named as a route pattern to intercept (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": "await page.route('http://cdn.acme.test/**', (r) => r.fulfill({ path: 'vendor/map.js' }));\n" +
				"await page.goto('https://fake.test/home');\n",
		}},
		{Name: "an http URL inside the markup a route fulfils with (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": route +
				"const body = '<a href=\"http://acme.test/legal\">terms</a>';\n" +
				"await page.goto('https://fake.test/home');\n",
		}},
		{Name: "a file that intercepts nothing, so it names no fake origin (FP guard)", Member: map[string]string{
			"scrape/read.mjs": "await page.goto('http://acme.test/prices');\n",
		}},
		{Name: "the check's own fixtures, whose job is to spell the insecure origin (FP guard)", Member: map[string]string{
			"packs/headless-browser/test/insecure-fake-origin.test.mjs": "const ROUTE = \"await page.route('**/*', (r) => r.fulfill({ body: '' }));\\n\";\n" +
				"'capture/shoot.mjs': ROUTE + \"await page.goto('http://fake.test/home');\\n\",\n",
		}},
		{Name: "a comment quoting the scheme it warns against (FP guard)", Member: map[string]string{
			"capture/shoot.mjs": route +
				"// Never 'http://fake.test' — geolocation takes the denied path there.\n" +
				"await page.goto('https://fake.test/home');\n",
		}},
	}))
}
