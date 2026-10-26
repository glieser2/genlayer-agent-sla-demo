"""Execute the contract locally with the official SDK and canned model output."""
import json
from pathlib import Path
from gltest.direct import VMContext, deploy_contract
from prepare_sdk import configure_sdk, VERSION
from windows_compat import enable_windows_compat, cleanup_deferred

ROOT = Path(__file__).resolve().parent
configure_sdk()
enable_windows_compat()
vm = VMContext()
vm.sender = b"\x11" * 20
try:
    with vm.activate():
        contract = deploy_contract(ROOT / "contracts/agent_sla.py", vm,
                                   (ROOT / "fixtures/case.json").read_text(), sdk_version=VERSION)
        vm.mock_llm(".*", (ROOT / "fixtures/model-response.json").read_text())
        output = {"execution": "official_sdk_direct_mode", "llm": "canned_fixture",
                  "network_deployment": False, "evidence_authenticity_verified": False,
                  "assessment": json.loads(contract.assess()),
                  "captured_validator_accepts_same_mock": vm.run_validator()}
        (ROOT / "demo-result.json").write_text(json.dumps(output, indent=2), encoding="utf-8")
        print(json.dumps(output, indent=2))
finally:
    cleanup_deferred()
