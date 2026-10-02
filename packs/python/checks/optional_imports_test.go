package checks

import "testing"

const pyprojectTOML = "[project]\nname = \"pkg\"\ndependencies = []\n\n[project.optional-dependencies]\nyamnet = [\"numpy>=1.21\", \"tensorflow>=2.11\", \"tensorflow-hub\", \"Pillow\"]\n"

func TestOptionalImportTopLevel(t *testing.T) {
	cases := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{"a bare top-level import", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/m.py": "import os\nimport tensorflow as tf\n"}, "pkg/m.py:2"},
		{"a from-import and a dash name", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/m.py": "from tensorflow_hub import load\nimport numpy.linalg, json  # math\n"}, "pkg/m.py:1 pkg/m.py:2"},
		{"an import inside a function", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/m.py": "def f():\n    import tensorflow\n"}, ""},
		{"a guarded top-level import", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/m.py": "try:\n    import tensorflow\nexcept ImportError:\n    tf = None\n"}, ""},
		{"stdlib only", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/m.py": "import os\nfrom . import x\n"}, ""},
		{"an unmapped dist", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/m.py": "import PIL\n"}, ""},
		{"no pyprojectTOML", map[string]string{"pkg/m.py": "import tensorflow\n"}, ""},
		{"no optional dependencies", map[string]string{"pyproject.toml": "[project]\nname = \"x\"\n", "pkg/m.py": "import tensorflow\n"}, ""},
		{"test files", map[string]string{"pyproject.toml": pyprojectTOML, "tests/m.py": "import tensorflow\n", "pkg/test_m.py": "import tensorflow\n", "pkg/m_test.py": "import tensorflow\n", "conftest.py": "import tensorflow\n"}, ""},
		{"the skill's own folder", map[string]string{"skills/python-optional-deps/pyproject.toml": pyprojectTOML, "skills/python-optional-deps/m.py": "import tensorflow\n"}, ""},
	}
	for _, c := range cases {
		expect(t, c.name, run(t, optionalImportTopLevel, c.files, nil), c.want)
	}
}

func TestOptionalImportInstallHint(t *testing.T) {
	guard := func(except string) string {
		return "def load():\n    try:\n        import tensorflow as tf\n    except ImportError as exc:\n" + except + "    return tf\n"
	}
	cases := []struct {
		name  string
		files map[string]string
		want  string
	}{
		{"a re-raise with no hint", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/b.py": guard("        raise ImportError(\"TensorFlow is required\") from exc\n")}, "pkg/b.py:5"},
		{"a bare raise", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/b.py": guard("        raise\n")}, "pkg/b.py:5"},
		{"a re-raise naming pip install", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/b.py": guard("        raise ImportError(\n            \"Install with:  pip install \\\"pkg[yamnet]\\\"\"\n        ) from exc\n")}, ""},
		{"a probe guard", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/b.py": guard("        tf = None\n")}, ""},
		{"a guard importing nothing optional", map[string]string{"pyproject.toml": pyprojectTOML, "pkg/b.py": "try:\n    import json\nexcept ImportError:\n    raise\n"}, ""},
		{"no pyprojectTOML", map[string]string{"pkg/b.py": guard("        raise\n")}, ""},
		{"test files", map[string]string{"pyproject.toml": pyprojectTOML, "tests/b.py": guard("        raise\n")}, ""},
	}
	for _, c := range cases {
		expect(t, c.name, run(t, optionalImportInstallHint, c.files, nil), c.want)
	}
}
