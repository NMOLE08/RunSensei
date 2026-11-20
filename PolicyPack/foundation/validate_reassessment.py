"""Research transition contract check only; not coaching or medical approval."""
import json
from pathlib import Path

root = Path(__file__).parent
policy = json.loads((root / '03_block_reassessment_v0.1.0_draft.json').read_text())
foundation = json.loads((root / '02_multiweek_v0.2.0_draft.json').read_text())
assert policy['id'] == 'runsensei.foundation.block_reassessment'
assert policy['version'] == '0.1.0-draft'
assert policy['status'] == 'draft' and policy['reviewer'] is None
assert policy['productionEligible'] is False
assert policy['nextPolicy'] == f"{foundation['policy_id']}@{foundation['version']}"
assert all(policy['rules'].get(key) for key in [
    'completion', 'feedback', 'health', 'confirmation', 'interruption',
    'actualSequence', 'transformation', 'continuousTransition', 'unsupported'
])
assert policy['evidence'] and policy['releaseBlockers']
print('PASS: draft reassessment policy, exact next-policy resolution, release restrictions')
