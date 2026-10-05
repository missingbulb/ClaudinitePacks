package test

import (
	"testing"

	"claudinitepacks.test/tools/checks/fixture"
)

// The port, and the one class allowed to read the device clock: it is what
// the `class …Clock` exemption is for, and what a fake replaces in a widget
// test.
const clockPort = `abstract class Clock {
  DateTime now();
}

class SystemClock implements Clock {
  @override
  DateTime now() => DateTime.now();
}
`

// The shape the rule asks for: the provider arrives as a parameter, so a
// test can hand the widget an in-memory substitute.
const injected = `import 'package:flutter/material.dart';

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.portrait});

  final ImageProvider portrait;

  @override
  Widget build(BuildContext context) => Image(image: portrait);
}
`

func TestDeviceClockNotInjected(t *testing.T) {
	const id = "finding flutter/device-clock-not-injected "
	fixture.Run(t, "flutter", []fixture.Case{
		{Name: "a widget rendering relative time off the device clock", Member: map[string]string{
			"lib/ui/countdown.dart": "import 'package:flutter/material.dart';\n" +
				"String remaining(DateTime start) =>\n" +
				"  start.difference(DateTime.now()).inMinutes.toString();\n",
		}, Expect: []string{id + "lib/ui/countdown.dart:3"}},
		{Name: "a model deciding what is past by asking the device", Member: map[string]string{
			"lib/models/show.dart": "bool get isOver => end.isBefore(DateTime.now());\n",
		}, Expect: []string{id + "lib/models/show.dart:1"}},
		{Name: "time read through the injected port (FP guard)", Member: map[string]string{
			"lib/ui/countdown.dart": "String remaining(Clock clock, DateTime start) =>\n" +
				"  start.difference(clock.now()).inMinutes.toString();\n",
		}},
		{Name: "the class that implements the port is where the read belongs (FP guard)", Member: map[string]string{
			"lib/adapters/system_clock.dart": clockPort,
		}},
		{Name: "the shipped fake world pins its own clock (FP guard)", Member: map[string]string{
			"lib/testing/fake_world.dart": "DateTime pinned() => DateTime.now();\n",
		}},
		{Name: "a comment explaining what not to call (FP guard)", Member: map[string]string{
			"lib/ui/notes.dart": "// Never DateTime.now() in a widget — the golden drifts with the wall clock.\n" +
				"String label(Clock clock) => clock.now().toIso8601String();\n",
		}},
		{Name: "a Dart file outside lib/ is not the shipped tree (FP guard)", Member: map[string]string{
			"tool/generate_fixtures.dart": "void main() => print(DateTime.now());\n",
		}},
		{Name: "a construction that is not a clock read (FP guard)", Member: map[string]string{
			"lib/ui/calendar.dart": "DateTime epoch() => DateTime.utc(1970);\n" +
				"DateTime parsed(String s) => DateTime.parse(s);\n",
		}},
	})
}

func TestNetworkFetchInWidgetTree(t *testing.T) {
	const id = "finding flutter/network-fetch-in-widget-tree "
	fixture.Run(t, "flutter", []fixture.Case{
		{Name: "a screen building Image.network itself", Member: map[string]string{
			"lib/screens/show_page.dart": "import 'package:flutter/material.dart';\n" +
				"Widget poster(String url) => Image.network(url);\n",
		}, Expect: []string{id + "lib/screens/show_page.dart:2"}},
		{Name: "a widget reaching the network through a NetworkImage provider", Member: map[string]string{
			"lib/widgets/avatar.dart": "import 'package:flutter/material.dart';\n" +
				"Decoration face(String url) => BoxDecoration(\n" +
				"  image: DecorationImage(image: NetworkImage(url)),\n" +
				");\n",
		}, Expect: []string{id + "lib/widgets/avatar.dart:3"}},
		{Name: "the cached_network_image spelling of the same fetch", Member: map[string]string{
			"lib/ui/gallery.dart": "import 'package:cached_network_image/cached_network_image.dart';\n" +
				"Widget tile(String url) => CachedNetworkImage(imageUrl: url);\n",
		}, Expect: []string{id + "lib/ui/gallery.dart:2"}},
		{Name: "a map whose tiles come off the network", Member: map[string]string{
			"lib/ui/map_view.dart": "import 'package:flutter_map/flutter_map.dart';\n" +
				"TileLayer tiles() => TileLayer(tileProvider: NetworkTileProvider());\n",
		}, Expect: []string{id + "lib/ui/map_view.dart:2"}},
		{Name: "the widget takes its provider as a parameter (FP guard)", Member: map[string]string{
			"lib/ui/avatar.dart": injected,
		}},
		{Name: "the real provider constructed where the adapters are wired (FP guard)", Member: map[string]string{
			"lib/main.dart": "import 'ui/avatar.dart';\n" +
				"void main() => runApp(Avatar(portrait: NetworkImage(profileUrl)));\n",
			"lib/adapters/tiles.dart": "TileProvider liveTiles() => NetworkTileProvider();\n",
			"lib/ui/avatar.dart":      injected,
		}},
		{Name: "a comment naming the constructor it warns about (FP guard)", Member: map[string]string{
			"lib/ui/notes.dart": "/// Never Image.network(url) here — the golden renders an error box.\n" +
				"// NetworkImage(url) is main.dart's to construct.\n" +
				injected,
		}},
		// Both of the next two are the call anchor's doing: it is what
		// separates constructing a fetcher from naming one.
		{Name: "a substitute whose name merely extends the constructor name (FP guard)", Member: map[string]string{
			"lib/ui/preview.dart": "import 'package:flutter/material.dart';\n" +
				"Widget preview() => Image(image: FakeNetworkImageProviderStub());\n",
		}},
		{Name: "naming the type without constructing one (FP guard)", Member: map[string]string{
			"lib/ui/debug_banner.dart": "bool isRemote(ImageProvider p) => p is NetworkImage;\n",
		}},
		{Name: "the widget tree is the scope, so a test file of its own is out of it (FP guard)", Member: map[string]string{
			"test/ui/avatar_test.dart": "void main() => expect(NetworkImage(url), isNotNull);\n",
		}},
	})
}
