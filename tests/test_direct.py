"""Official direct-mode SDK tests with canned LLM output; no paid or live LLM."""
import json
from pathlib import Path
import pytest
import sys
from gltest.direct import VMContext, deploy_contract
from gltest.direct import sdk_loader

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from prepare_sdk import configure_sdk, VERSION
from windows_compat import enable_windows_compat, cleanup_deferred
configure_sdk()
enable_windows_compat()
CONTRACT = ROOT / "contracts/agent_sla.py"


@pytest.fixture(scope="module")
def base_contract():
    vm = VMContext()
    vm.sender = b"\x11" * 20  # synthetic local test caller, never a wallet
    snapshot = (ROOT / "fixtures/case.json").read_text()
    answer = json.loads((ROOT / "fixtures/model-response.json").read_text())
    try:
        with vm.activate():
            contract = deploy_contract(CONTRACT, vm, snapshot, sdk_version=VERSION)
            yield vm, contract, answer
    finally:
        cleanup_deferred()


@pytest.fixture
def deployed(base_contract):
    vm, contract, original_answer = base_contract
    checkpoint = vm.snapshot()
    answer = json.loads(json.dumps(original_answer))
    vm.mock_llm(".*", json.dumps(answer))
    try:
        yield vm, contract, answer
    finally:
        vm.revert(checkpoint)


def test_sdk_assessment_and_validator(deployed):
    vm, contract, _ = deployed
    result = json.loads(contract.assess())
    assert [f["status"] for f in result["findings"]] == [
        "met", "not_met", "not_met", "insufficient_evidence"]
    assert vm.run_validator() is True
    assert json.loads(contract.get_result()) == result


def test_sdk_validator_rejects_independent_disagreement(deployed):
    vm, contract, answer = deployed
    contract.assess()
    answer["findings"][0]["status"] = "met"
    vm.clear_mocks()
    vm.mock_llm(".*", json.dumps(answer))
    assert vm.run_validator() is False


def test_sdk_validator_rejects_forged_evidence(deployed):
    vm, contract, answer = deployed
    contract.assess()
    answer["findings"][0]["evidence_ids"] = ["E999"]
    assert vm.run_validator(leader_result=answer) is False


def test_sdk_repeat_assessment_rejected(deployed):
    _, contract, _ = deployed
    contract.assess()
    with pytest.raises(Exception, match="already assessed"):
        contract.assess()


def test_sdk_owner_guard(deployed):
    vm, contract, _ = deployed
    with vm.prank(b"\x22" * 20):
        with pytest.raises(Exception, match="owner only"):
            contract.assess()


def test_sdk_invalid_model_result_leaves_no_report(deployed):
    vm, contract, _ = deployed
    vm.clear_mocks()
    vm.mock_llm(".*", '{"findings": []}')
    with pytest.raises(Exception):
        contract.assess()
    assert contract.get_result() == ""
