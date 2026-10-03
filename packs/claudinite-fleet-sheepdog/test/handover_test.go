package test

import (
	"encoding/json"
	"os"
	"os/exec"
	"testing"
)

type handover struct {
	Step   string `json:"step"`
	Breaks string `json:"breaks"`
	Done   string `json:"done"`
}

// The pack's adoption handover step is the engine's grant table rendered:
// `cn fleet token --json` prints it, and the manifest carries it verbatim
// so an adopting person reads the whole grant before the first sweep runs.
func TestTheHandoverStepIsTheEnginesGrant(t *testing.T) {
	out, err := exec.Command(os.Getenv("CLAUDINITE_CN"), "fleet", "token", "--json").Output()
	if err != nil {
		t.Fatalf("cn fleet token --json: %v", err)
	}
	var engine struct {
		Handover handover `json:"handover"`
	}
	if err := json.Unmarshal(out, &engine); err != nil || engine.Handover.Step == "" {
		t.Fatalf("cn fleet token --json printed no handover: %v\n%s", err, out)
	}
	raw, err := os.ReadFile("../pack.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		AdoptionHandover []handover `json:"adoptionHandover"`
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.AdoptionHandover) != 1 || manifest.AdoptionHandover[0] != engine.Handover {
		t.Errorf("pack.json adoptionHandover %+v, cn fleet token's handover %+v", manifest.AdoptionHandover, engine.Handover)
	}
}
